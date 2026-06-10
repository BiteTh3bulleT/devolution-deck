//! Plugin DSP chain execution for offline render and playback preview.

use crate::models::{PluginDescriptor, PluginInstance};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use rack::vst3::Vst3Scanner;
use rack::{ParameterInfo, PluginInfo, PluginInstance as RackPluginInstance, PluginScanner};
use std::collections::HashMap;
use std::f32::consts::PI;
use std::path::{Path, PathBuf};

const MAX_BLOCK_SIZE: usize = 1024;

fn db_to_gain(db: f64) -> f32 {
    (10f64.powf(db / 20.0)) as f32
}

fn parameter_value(instance: &PluginInstance, id: &str, fallback: f64) -> f64 {
    instance
        .parameters
        .iter()
        .find(|p| p.id == id)
        .map(|p| p.value)
        .unwrap_or(fallback)
}

fn apply_builtin_processor(
    samples: &mut [f32],
    instance: &PluginInstance,
    sample_rate: u32,
) -> bool {
    match instance.descriptor_id.as_str() {
        "builtin://gain" => {
            let gain_db = parameter_value(instance, "gain_db", 0.0);
            let g = db_to_gain(gain_db);
            for sample in samples.iter_mut() {
                *sample *= g;
            }
            true
        }
        "builtin://lowpass" => {
            let cutoff = parameter_value(instance, "cutoff_hz", 9000.0).clamp(40.0, 20000.0);
            let dt = 1.0f32 / sample_rate as f32;
            let rc = 1.0f32 / (2.0 * PI * cutoff as f32);
            let alpha = dt / (rc + dt);
            let mut y = 0.0f32;
            for sample in samples.iter_mut() {
                y += alpha * (*sample - y);
                *sample = y;
            }
            true
        }
        "builtin://compressor" => {
            let threshold_db = parameter_value(instance, "threshold_db", -18.0).clamp(-60.0, 0.0);
            let ratio = parameter_value(instance, "ratio", 3.0).clamp(1.0, 20.0) as f32;
            let attack_ms = parameter_value(instance, "attack_ms", 10.0).clamp(1.0, 200.0) as f32;
            let release_ms =
                parameter_value(instance, "release_ms", 120.0).clamp(10.0, 1000.0) as f32;
            let makeup_db = parameter_value(instance, "makeup_db", 0.0).clamp(-12.0, 24.0);

            let threshold = db_to_gain(threshold_db);
            let makeup = db_to_gain(makeup_db);
            let attack_coeff = (-1.0f32 / ((attack_ms / 1000.0) * sample_rate as f32)).exp();
            let release_coeff = (-1.0f32 / ((release_ms / 1000.0) * sample_rate as f32)).exp();

            let mut env = 0.0f32;
            let mut gain = 1.0f32;
            for sample in samples.iter_mut() {
                let x = sample.abs();
                let coeff = if x > env { attack_coeff } else { release_coeff };
                env = x + coeff * (env - x);
                let desired_gain = if env > threshold && env > 0.0 {
                    let compressed = threshold + (env - threshold) / ratio;
                    (compressed / env).clamp(0.05, 1.0)
                } else {
                    1.0
                };
                let gain_coeff = if desired_gain < gain {
                    attack_coeff
                } else {
                    release_coeff
                };
                gain = desired_gain + gain_coeff * (gain - desired_gain);
                *sample *= gain * makeup;
            }
            true
        }
        _ => false,
    }
}

fn normalize_parameter_value(value: f64, info: Option<&ParameterInfo>) -> f32 {
    let Some(info) = info else {
        return value.clamp(0.0, 1.0) as f32;
    };

    if (0.0..=1.0).contains(&value) {
        return value as f32;
    }

    let span = (info.max - info.min).abs();
    if span < f32::EPSILON {
        return value.clamp(0.0, 1.0) as f32;
    }

    ((value as f32 - info.min) / (info.max - info.min)).clamp(0.0, 1.0)
}

fn same_path(a: &Path, b: &Path) -> bool {
    if a == b {
        return true;
    }
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(ac), Ok(bc)) => ac == bc,
        _ => false,
    }
}

struct ExternalVstHost {
    scanner: Option<Vst3Scanner>,
    default_scan: Option<Vec<PluginInfo>>,
    path_cache: HashMap<PathBuf, Vec<PluginInfo>>,
}

impl ExternalVstHost {
    fn new() -> Self {
        Self {
            scanner: None,
            default_scan: None,
            path_cache: HashMap::new(),
        }
    }

    fn scanner_mut(&mut self) -> Result<&mut Vst3Scanner, String> {
        if self.scanner.is_none() {
            self.scanner = Some(Vst3Scanner::new().map_err(|e| e.to_string())?);
        }
        self.scanner
            .as_mut()
            .ok_or_else(|| "Failed to initialize VST3 scanner".to_string())
    }

    fn scan_default(&mut self) -> Result<&[PluginInfo], String> {
        if self.default_scan.is_none() {
            let plugins = self.scanner_mut()?.scan().map_err(|e| e.to_string())?;
            self.default_scan = Some(plugins);
        }
        Ok(self.default_scan.as_deref().unwrap_or(&[]))
    }

    fn scan_path(&mut self, path: &Path) -> Result<&[PluginInfo], String> {
        let key = path.to_path_buf();
        if !self.path_cache.contains_key(&key) {
            let plugins = self
                .scanner_mut()?
                .scan_path(path)
                .map_err(|e| e.to_string())?;
            self.path_cache.insert(key.clone(), plugins);
        }
        Ok(self.path_cache.get(&key).map(Vec::as_slice).unwrap_or(&[]))
    }

    fn find_plugin_info(
        &mut self,
        descriptor: &PluginDescriptor,
    ) -> Result<Option<PluginInfo>, String> {
        let binary = PathBuf::from(descriptor.binary_path.as_str());
        let bundle = PathBuf::from(descriptor.bundle_path.as_str());

        if let Some(parent) = bundle.parent() {
            for plugin in self.scan_path(parent)? {
                if same_path(plugin.path.as_path(), binary.as_path())
                    || same_path(plugin.path.as_path(), bundle.as_path())
                {
                    return Ok(Some(plugin.clone()));
                }
            }
        }

        for plugin in self.scan_default()? {
            if same_path(plugin.path.as_path(), binary.as_path())
                || same_path(plugin.path.as_path(), bundle.as_path())
            {
                return Ok(Some(plugin.clone()));
            }
        }

        let target_name = descriptor.name.to_ascii_lowercase();
        Ok(self
            .scan_default()?
            .iter()
            .find(|plugin| plugin.name.to_ascii_lowercase() == target_name)
            .cloned())
    }

    /// Load, initialize, and configure a plugin instance ready for processing.
    fn prepare_external_instance(
        &mut self,
        sample_rate: u32,
        instance: &PluginInstance,
        descriptor: &PluginDescriptor,
    ) -> Option<rack::vst3::Vst3Plugin> {
        let plugin_info = match self.find_plugin_info(descriptor) {
            Ok(Some(info)) => info,
            Ok(None) => return None,
            Err(err) => {
                eprintln!("VST3 scan failed: {err}");
                return None;
            }
        };

        let scanner = match self.scanner_mut() {
            Ok(scanner) => scanner,
            Err(err) => {
                eprintln!("VST3 scanner unavailable: {err}");
                return None;
            }
        };
        let mut plugin = match scanner.load(&plugin_info) {
            Ok(plugin) => plugin,
            Err(err) => {
                eprintln!("VST3 load failed ({}): {err}", descriptor.name);
                return None;
            }
        };
        if let Err(err) = plugin.initialize(sample_rate as f64, MAX_BLOCK_SIZE) {
            eprintln!("VST3 init failed ({}): {err}", descriptor.name);
            return None;
        }

        if let Some(state_b64) = instance.serialized_state_b64.as_ref() {
            if let Ok(state_bytes) = BASE64_STANDARD.decode(state_b64) {
                if let Err(err) = plugin.set_state(state_bytes.as_slice()) {
                    eprintln!("VST3 set_state failed ({}): {err}", descriptor.name);
                }
            }
        }

        let mut params_by_name: HashMap<String, usize> = HashMap::new();
        let mut params_by_index: HashMap<usize, ParameterInfo> = HashMap::new();
        for idx in 0..plugin.parameter_count() {
            if let Ok(info) = plugin.parameter_info(idx) {
                params_by_name.insert(info.name.to_ascii_lowercase(), idx);
                params_by_index.insert(idx, info);
            }
        }

        for param in &instance.parameters {
            let index = param
                .id
                .parse::<usize>()
                .ok()
                .or_else(|| {
                    param
                        .id
                        .strip_prefix("param_")
                        .and_then(|v| v.parse::<usize>().ok())
                })
                .or_else(|| {
                    let key = param.id.to_ascii_lowercase();
                    params_by_name.get(&key).copied()
                });

            let Some(index) = index else {
                continue;
            };
            let value = normalize_parameter_value(param.value, params_by_index.get(&index));
            if let Err(err) = plugin.set_parameter(index, value) {
                eprintln!(
                    "VST3 set_parameter failed ({}, {}): {err}",
                    descriptor.name, param.id
                );
            }
        }

        Some(plugin)
    }

    fn process_external_instance(
        &mut self,
        samples: &mut [f32],
        sample_rate: u32,
        instance: &PluginInstance,
        descriptor: &PluginDescriptor,
    ) {
        let Some(mut plugin) = self.prepare_external_instance(sample_rate, instance, descriptor)
        else {
            return;
        };

        let mut in_left = vec![0.0f32; MAX_BLOCK_SIZE];
        let mut in_right = vec![0.0f32; MAX_BLOCK_SIZE];
        let mut out_left = vec![0.0f32; MAX_BLOCK_SIZE];
        let mut out_right = vec![0.0f32; MAX_BLOCK_SIZE];

        let mut cursor = 0usize;
        while cursor < samples.len() {
            let frames = (samples.len() - cursor).min(MAX_BLOCK_SIZE);
            let chunk = &samples[cursor..cursor + frames];

            in_left[..frames].copy_from_slice(chunk);
            in_right[..frames].copy_from_slice(chunk);

            if let Err(err) = plugin.process(
                &[&in_left[..frames], &in_right[..frames]],
                &mut [&mut out_left[..frames], &mut out_right[..frames]],
                frames,
            ) {
                eprintln!("VST3 process failed ({}): {err}", descriptor.name);
                break;
            }

            for frame in 0..frames {
                samples[cursor + frame] = 0.5 * (out_left[frame] + out_right[frame]);
            }
            cursor += frames;
        }
    }

    /// Process a true stereo pair through an external VST3 instance.
    fn process_external_instance_stereo(
        &mut self,
        left: &mut [f32],
        right: &mut [f32],
        sample_rate: u32,
        instance: &PluginInstance,
        descriptor: &PluginDescriptor,
    ) {
        let Some(mut plugin) = self.prepare_external_instance(sample_rate, instance, descriptor)
        else {
            return;
        };

        let mut out_left = vec![0.0f32; MAX_BLOCK_SIZE];
        let mut out_right = vec![0.0f32; MAX_BLOCK_SIZE];

        let total = left.len().min(right.len());
        let mut cursor = 0usize;
        while cursor < total {
            let frames = (total - cursor).min(MAX_BLOCK_SIZE);

            if let Err(err) = plugin.process(
                &[
                    &left[cursor..cursor + frames],
                    &right[cursor..cursor + frames],
                ],
                &mut [&mut out_left[..frames], &mut out_right[..frames]],
                frames,
            ) {
                eprintln!("VST3 process failed ({}): {err}", descriptor.name);
                break;
            }

            left[cursor..cursor + frames].copy_from_slice(&out_left[..frames]);
            right[cursor..cursor + frames].copy_from_slice(&out_right[..frames]);
            cursor += frames;
        }
    }
}

/// Apply a full plugin chain to mono samples.
/// Builtin processors run first-class; VST3 descriptors execute through rack host.
pub fn apply_plugin_chain(
    samples: &mut [f32],
    chain: &[PluginInstance],
    sample_rate: u32,
    registry: &[PluginDescriptor],
) {
    if chain.is_empty() || samples.is_empty() {
        return;
    }

    let mut ordered = chain.to_vec();
    ordered.sort_by_key(|entry| entry.order);
    let mut host = ExternalVstHost::new();

    for instance in ordered {
        if !instance.enabled || instance.bypassed {
            continue;
        }
        if apply_builtin_processor(samples, &instance, sample_rate) {
            continue;
        }

        let Some(descriptor) = registry
            .iter()
            .find(|descriptor| descriptor.id == instance.descriptor_id)
        else {
            continue;
        };
        if !descriptor.format.eq_ignore_ascii_case("vst3") {
            continue;
        }
        if !descriptor.factory_symbol_found {
            continue;
        }

        host.process_external_instance(samples, sample_rate, &instance, descriptor);
    }
}

/// Attempt to actually load and initialize a plugin so failures surface
/// before the user trusts it in a chain. Returns a human-readable success
/// note or the failure reason.
pub fn preflight_plugin(descriptor: &PluginDescriptor, sample_rate: u32) -> Result<String, String> {
    if descriptor.format.eq_ignore_ascii_case("builtin") {
        return match descriptor.id.as_str() {
            "builtin://gain" | "builtin://lowpass" | "builtin://compressor" => {
                Ok(format!("{} is a built-in processor", descriptor.name))
            }
            other => Err(format!("Unknown built-in plugin id: {other}")),
        };
    }
    if !descriptor.format.eq_ignore_ascii_case("vst3") {
        return Err(format!(
            "Unsupported plugin format '{}' — only built-ins and VST3 are hosted",
            descriptor.format
        ));
    }
    if !Path::new(descriptor.binary_path.as_str()).exists() {
        return Err(format!(
            "Plugin binary not found at {}",
            descriptor.binary_path
        ));
    }
    if !descriptor.factory_symbol_found {
        return Err(format!(
            "{} does not expose GetPluginFactory; it cannot be hosted",
            descriptor.name
        ));
    }

    let mut host = ExternalVstHost::new();
    let plugin_info = host
        .find_plugin_info(descriptor)?
        .ok_or_else(|| format!("{} was not found by the VST3 scanner", descriptor.name))?;
    let scanner = host.scanner_mut()?;
    let mut plugin = scanner
        .load(&plugin_info)
        .map_err(|e| format!("Load failed: {e}"))?;
    plugin
        .initialize(sample_rate as f64, MAX_BLOCK_SIZE)
        .map_err(|e| format!("Initialize failed: {e}"))?;
    Ok(format!(
        "{} loaded and initialized at {sample_rate} Hz ({} parameters)",
        descriptor.name,
        plugin.parameter_count()
    ))
}

/// Apply a full plugin chain to a stereo pair. Builtins run dual-mono (the
/// same processor independently per channel); external VST3 instances are
/// fed the true left/right pair.
pub fn apply_plugin_chain_stereo(
    left: &mut [f32],
    right: &mut [f32],
    chain: &[PluginInstance],
    sample_rate: u32,
    registry: &[PluginDescriptor],
) {
    if chain.is_empty() || left.is_empty() {
        return;
    }

    let mut ordered = chain.to_vec();
    ordered.sort_by_key(|entry| entry.order);
    let mut host = ExternalVstHost::new();

    for instance in ordered {
        if !instance.enabled || instance.bypassed {
            continue;
        }
        let handled_left = apply_builtin_processor(left, &instance, sample_rate);
        if handled_left {
            apply_builtin_processor(right, &instance, sample_rate);
            continue;
        }

        let Some(descriptor) = registry
            .iter()
            .find(|descriptor| descriptor.id == instance.descriptor_id)
        else {
            continue;
        };
        if !descriptor.format.eq_ignore_ascii_case("vst3") {
            continue;
        }
        if !descriptor.factory_symbol_found {
            continue;
        }

        host.process_external_instance_stereo(left, right, sample_rate, &instance, descriptor);
    }
}

#[cfg(test)]
mod tests {
    use super::{apply_plugin_chain, preflight_plugin};
    use crate::models::{PluginDescriptor, PluginInstance, PluginParameterState};

    fn instance(descriptor_id: &str, order: u32, params: &[(&str, f64)]) -> PluginInstance {
        PluginInstance {
            id: format!("{descriptor_id}-{order}"),
            descriptor_id: descriptor_id.to_string(),
            enabled: true,
            bypassed: false,
            order,
            parameters: params
                .iter()
                .map(|(id, value)| PluginParameterState {
                    id: id.to_string(),
                    value: *value,
                })
                .collect(),
            serialized_state_b64: None,
        }
    }

    #[test]
    fn builtin_gain_changes_level() {
        let mut samples = vec![0.25f32; 64];
        let chain = vec![instance("builtin://gain", 0, &[("gain_db", 6.020599913279624)])];
        apply_plugin_chain(&mut samples, &chain, 48000, &[]);
        assert!((samples[32] - 0.5).abs() < 1e-3, "got {}", samples[32]);
    }

    #[test]
    fn bypassed_and_disabled_instances_do_not_process() {
        let mut samples = vec![0.25f32; 16];
        let mut bypassed = instance("builtin://gain", 0, &[("gain_db", 12.0)]);
        bypassed.bypassed = true;
        let mut disabled = instance("builtin://gain", 1, &[("gain_db", 12.0)]);
        disabled.enabled = false;
        apply_plugin_chain(&mut samples, &[bypassed, disabled], 48000, &[]);
        assert!((samples[8] - 0.25).abs() < 1e-6);
    }

    #[test]
    fn builtin_compressor_reduces_dynamics() {
        // Loud step into the compressor: output dynamic range must shrink.
        let mut samples: Vec<f32> = (0..48000)
            .map(|i| if i < 24000 { 0.1 } else { 0.9 })
            .collect();
        let chain = vec![instance(
            "builtin://compressor",
            0,
            &[("threshold_db", -18.0), ("ratio", 8.0)],
        )];
        let quiet_in = 0.1f32;
        let loud_in = 0.9f32;
        apply_plugin_chain(&mut samples, &chain, 48000, &[]);
        let quiet_out = samples[20000];
        let loud_out = samples[47000];
        let in_ratio = loud_in / quiet_in;
        let out_ratio = loud_out / quiet_out;
        assert!(
            out_ratio < in_ratio * 0.8,
            "compressor did not reduce dynamics: in {in_ratio} out {out_ratio}"
        );
    }

    #[test]
    fn chain_order_changes_result() {
        let signal: Vec<f32> = (0..4800)
            .map(|i| if i % 480 < 10 { 0.9 } else { 0.05 })
            .collect();

        let mut comp_then_gain = signal.clone();
        apply_plugin_chain(
            &mut comp_then_gain,
            &[
                instance("builtin://compressor", 0, &[("threshold_db", -12.0)]),
                instance("builtin://gain", 1, &[("gain_db", 6.0)]),
            ],
            48000,
            &[],
        );

        let mut gain_then_comp = signal.clone();
        apply_plugin_chain(
            &mut gain_then_comp,
            &[
                instance("builtin://gain", 0, &[("gain_db", 6.0)]),
                instance("builtin://compressor", 1, &[("threshold_db", -12.0)]),
            ],
            48000,
            &[],
        );

        assert_ne!(comp_then_gain, gain_then_comp, "order must matter");
    }

    #[test]
    fn preflight_accepts_builtins_and_rejects_missing_binaries() {
        let builtin = PluginDescriptor {
            id: "builtin://gain".to_string(),
            name: "Gain".to_string(),
            vendor: "DEVOLUTION".to_string(),
            version: "1.0.0".to_string(),
            format: "builtin".to_string(),
            bundle_path: "builtin://gain".to_string(),
            binary_path: "builtin://gain".to_string(),
            factory_symbol_found: true,
        };
        assert!(preflight_plugin(&builtin, 48000).is_ok());

        let missing = PluginDescriptor {
            id: "vst3::/nonexistent/Fake.vst3".to_string(),
            name: "Fake".to_string(),
            vendor: "Nobody".to_string(),
            version: "0.0.0".to_string(),
            format: "vst3".to_string(),
            bundle_path: "/nonexistent/Fake.vst3".to_string(),
            binary_path: "/nonexistent/Fake.vst3/Contents/x86_64-linux/Fake.so".to_string(),
            factory_symbol_found: false,
        };
        let err = preflight_plugin(&missing, 48000).expect_err("must fail");
        assert!(!err.is_empty());
    }
}
