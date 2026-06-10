//! VST3 plugin discovery and validation foundation.
//! This does not yet execute plugin DSP in realtime, but it performs real
//! filesystem scan and binary-level host compatibility checks.

use crate::models::PluginDescriptor;
use libloading::Library;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub fn builtin_descriptors() -> Vec<PluginDescriptor> {
    vec![
        PluginDescriptor {
            id: "builtin://gain".to_string(),
            name: "Gain".to_string(),
            vendor: "DEVOLUTION".to_string(),
            version: "1.0.0".to_string(),
            format: "builtin".to_string(),
            bundle_path: "builtin://gain".to_string(),
            binary_path: "builtin://gain".to_string(),
            factory_symbol_found: true,
        },
        PluginDescriptor {
            id: "builtin://lowpass".to_string(),
            name: "Lowpass".to_string(),
            vendor: "DEVOLUTION".to_string(),
            version: "1.0.0".to_string(),
            format: "builtin".to_string(),
            bundle_path: "builtin://lowpass".to_string(),
            binary_path: "builtin://lowpass".to_string(),
            factory_symbol_found: true,
        },
        PluginDescriptor {
            id: "builtin://compressor".to_string(),
            name: "Compressor".to_string(),
            vendor: "DEVOLUTION".to_string(),
            version: "1.0.0".to_string(),
            format: "builtin".to_string(),
            bundle_path: "builtin://compressor".to_string(),
            binary_path: "builtin://compressor".to_string(),
            factory_symbol_found: true,
        },
    ]
}

pub fn default_vst3_roots() -> Vec<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        vec![
            PathBuf::from(r"C:\Program Files\Common Files\VST3"),
            PathBuf::from(r"C:\Program Files (x86)\Common Files\VST3"),
        ]
    }
    #[cfg(target_os = "macos")]
    {
        vec![
            PathBuf::from("/Library/Audio/Plug-Ins/VST3"),
            PathBuf::from("~/Library/Audio/Plug-Ins/VST3"),
        ]
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        vec![
            PathBuf::from("/usr/lib/vst3"),
            PathBuf::from("/usr/local/lib/vst3"),
            PathBuf::from("~/.vst3"),
        ]
    }
}

fn expand_tilde(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    if !s.starts_with("~/") {
        return path.to_path_buf();
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join(s.trim_start_matches("~/"));
    }
    path.to_path_buf()
}

fn collect_vst3_bundles(root: &Path) -> Vec<PathBuf> {
    let mut bundles = Vec::new();
    if !root.exists() {
        return bundles;
    }
    for entry in WalkDir::new(root).follow_links(true) {
        let Ok(entry) = entry else { continue };
        if entry.file_type().is_dir()
            && entry
                .path()
                .extension()
                .is_some_and(|ext| ext.to_string_lossy().eq_ignore_ascii_case("vst3"))
        {
            bundles.push(entry.path().to_path_buf());
        }
    }
    bundles
}

fn try_module_info(bundle: &Path) -> (String, String) {
    let module_info = bundle
        .join("Contents")
        .join("Resources")
        .join("moduleinfo.json");
    let Ok(contents) = std::fs::read_to_string(module_info) else {
        return ("Unknown".to_string(), "0.0.0".to_string());
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&contents) else {
        return ("Unknown".to_string(), "0.0.0".to_string());
    };
    let vendor = json
        .get("Factory Info")
        .and_then(|v| v.get("Vendor"))
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown")
        .to_string();
    let version = json
        .get("Factory Info")
        .and_then(|v| v.get("Version"))
        .and_then(|v| v.as_str())
        .unwrap_or("0.0.0")
        .to_string();
    (vendor, version)
}

fn resolve_vst3_binary(bundle: &Path) -> Option<PathBuf> {
    let name = bundle.file_stem()?.to_string_lossy().to_string();
    let candidates = vec![
        bundle
            .join("Contents")
            .join("x86_64-linux")
            .join(format!("{name}.so")),
        bundle
            .join("Contents")
            .join("x86-linux")
            .join(format!("{name}.so")),
        bundle.join("Contents").join("MacOS").join(&name),
        bundle
            .join("Contents")
            .join("x86_64-win")
            .join(format!("{name}.vst3")),
    ];
    for candidate in candidates {
        if candidate.exists() {
            return Some(candidate);
        }
    }

    let search_dir = bundle.join("Contents");
    if !search_dir.exists() {
        return None;
    }
    for entry in WalkDir::new(search_dir).follow_links(true) {
        let Ok(entry) = entry else { continue };
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let ext = path
            .extension()
            .map(|v| v.to_string_lossy().to_ascii_lowercase());
        if matches!(ext.as_deref(), Some("so" | "dll" | "dylib" | "vst3")) {
            return Some(path.to_path_buf());
        }
    }
    None
}

fn has_get_plugin_factory(binary: &Path) -> bool {
    // SAFETY: library is loaded only for symbol lookup and dropped immediately.
    unsafe {
        let Ok(lib) = Library::new(binary) else {
            return false;
        };
        let symbol =
            lib.get::<unsafe extern "C" fn() -> *mut std::ffi::c_void>(b"GetPluginFactory");
        symbol.is_ok()
    }
}

fn descriptor_for_bundle(bundle: &Path) -> Option<PluginDescriptor> {
    let name = bundle.file_stem()?.to_string_lossy().to_string();
    let binary = resolve_vst3_binary(bundle)?;
    let (vendor, version) = try_module_info(bundle);
    let factory_symbol_found = has_get_plugin_factory(&binary);
    Some(PluginDescriptor {
        id: format!("vst3::{}", bundle.to_string_lossy()),
        name,
        vendor,
        version,
        format: "vst3".to_string(),
        bundle_path: bundle.to_string_lossy().to_string(),
        binary_path: binary.to_string_lossy().to_string(),
        factory_symbol_found,
    })
}

pub fn scan_vst3_roots(roots: &[PathBuf]) -> Vec<PluginDescriptor> {
    let mut descriptors = builtin_descriptors();
    for root in roots {
        let expanded = expand_tilde(root);
        let bundles = collect_vst3_bundles(&expanded);
        for bundle in bundles {
            if let Some(desc) = descriptor_for_bundle(&bundle) {
                descriptors.push(desc);
            }
        }
    }
    descriptors.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    descriptors.dedup_by(|a, b| a.id == b.id);
    descriptors
}
