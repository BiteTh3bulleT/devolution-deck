//! Native audio laboratory. Measurements use decoded PCM, never invented meters.
use super::render::{decode_audio_stereo, resample_stereo, write_wav, StereoSource};
use rustfft::{num_complex::Complex, FftPlanner};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, Serialize)]
pub struct WaveBin {
    pub left_min: f32,
    pub left_max: f32,
    pub right_min: f32,
    pub right_max: f32,
}
#[derive(Clone, Debug, Serialize)]
pub struct SpectrumBin {
    pub frequency_hz: f64,
    pub dbfs: f64,
}
#[derive(Clone, Debug, Serialize)]
pub struct AudioAnalysis {
    pub sample_rate: u32,
    pub duration_secs: f64,
    pub peak_dbfs: f64,
    pub rms_dbfs: f64,
    pub crest_db: f64,
    pub integrated_lufs: Option<f64>,
    pub dc_left: f64,
    pub dc_right: f64,
    pub stereo_correlation: f64,
    pub clipped_samples: u64,
    pub silence_secs: f64,
    pub waveform: Vec<WaveBin>,
    pub spectrum: Vec<SpectrumBin>,
    pub transient_secs: Vec<f64>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(default)]
pub struct ProcessSettings {
    pub start_secs: f64,
    pub end_secs: Option<f64>,
    pub gain_db: f64,
    pub normalize_dbfs: Option<f64>,
    pub reverse: bool,
    pub mono: bool,
    pub invert_left: bool,
    pub invert_right: bool,
    pub fade_in_ms: f64,
    pub fade_out_ms: f64,
    pub highpass_hz: Option<f64>,
    pub lowpass_hz: Option<f64>,
    pub compressor_threshold_db: Option<f64>,
    pub compressor_ratio: f64,
    pub limiter_ceiling_dbfs: Option<f64>,
    pub output_sample_rate: Option<u32>,
    pub stretch_ratio: f64,
}
impl Default for ProcessSettings {
    fn default() -> Self {
        Self {
            start_secs: 0.0,
            end_secs: None,
            gain_db: 0.0,
            normalize_dbfs: None,
            reverse: false,
            mono: false,
            invert_left: false,
            invert_right: false,
            fade_in_ms: 0.0,
            fade_out_ms: 0.0,
            highpass_hz: None,
            lowpass_hz: None,
            compressor_threshold_db: None,
            compressor_ratio: 4.0,
            limiter_ceiling_dbfs: None,
            output_sample_rate: None,
            stretch_ratio: 1.0,
        }
    }
}
#[derive(Clone, Debug, Deserialize)]
pub struct SignalSettings {
    pub kind: String,
    pub duration_secs: f64,
    pub frequency_hz: f64,
    pub end_frequency_hz: f64,
    pub level_dbfs: f64,
    pub sample_rate: u32,
}
#[derive(Serialize)]
pub struct LabResult {
    pub path: String,
    pub analysis: AudioAnalysis,
}
fn db(value: f64) -> f64 {
    20.0 * value.max(1e-8).log10()
}
fn gain(value: f64) -> f64 {
    10.0f64.powf(value / 20.0)
}

#[derive(Clone, Copy)]
struct Biquad {
    b: [f64; 3],
    a: [f64; 2],
    x: [f64; 2],
    y: [f64; 2],
}
impl Biquad {
    fn filter(&mut self, x: f64) -> f64 {
        let y = self.b[0] * x + self.b[1] * self.x[0] + self.b[2] * self.x[1]
            - self.a[0] * self.y[0]
            - self.a[1] * self.y[1];
        self.x = [x, self.x[0]];
        self.y = [y, self.y[0]];
        y
    }
    fn new(rate: u32, hz: f64, kind: &str) -> Self {
        let w = 2.0 * std::f64::consts::PI * hz.min(rate as f64 * 0.45) / rate as f64;
        let (c, s) = (w.cos(), w.sin());
        let alpha = s / (2.0 * std::f64::consts::FRAC_1_SQRT_2);
        let (b, a) = match kind {
            "highpass" => (
                [(1.0 + c) / 2.0, -(1.0 + c), (1.0 + c) / 2.0],
                [1.0 + alpha, -2.0 * c, 1.0 - alpha],
            ),
            "shelf" => {
                let v = gain(4.0 / 2.0);
                let beta = 2.0 * v.sqrt() * alpha;
                (
                    [
                        v * ((v + 1.0) + (v - 1.0) * c + beta),
                        -2.0 * v * ((v - 1.0) + (v + 1.0) * c),
                        v * ((v + 1.0) + (v - 1.0) * c - beta),
                    ],
                    [
                        (v + 1.0) - (v - 1.0) * c + beta,
                        2.0 * ((v - 1.0) - (v + 1.0) * c),
                        (v + 1.0) - (v - 1.0) * c - beta,
                    ],
                )
            }
            _ => (
                [(1.0 - c) / 2.0, 1.0 - c, (1.0 - c) / 2.0],
                [1.0 + alpha, -2.0 * c, 1.0 - alpha],
            ),
        };
        Self {
            b: [b[0] / a[0], b[1] / a[0], b[2] / a[0]],
            a: [a[1] / a[0], a[2] / a[0]],
            x: [0.0; 2],
            y: [0.0; 2],
        }
    }
}
pub(crate) fn analyze(source: &StereoSource, rate: u32) -> AudioAnalysis {
    let n = source.left.len().min(source.right.len());
    let duration = n as f64 / rate as f64;
    let (mut peak, mut energy, mut dl, mut dr, mut lr, mut ll, mut rr, mut clipped) =
        (0.0f64, 0.0f64, 0.0, 0.0, 0.0, 0.0, 0.0, 0u64);
    let (mut shelf_l, mut shelf_r) = (
        Biquad::new(rate, 1681.97, "shelf"),
        Biquad::new(rate, 1681.97, "shelf"),
    );
    let (mut hp_l, mut hp_r) = (
        Biquad::new(rate, 38.14, "highpass"),
        Biquad::new(rate, 38.14, "highpass"),
    );
    let mut weighted = Vec::with_capacity(n + 1);
    weighted.push(0.0);
    let mut silent = 0usize;
    for i in 0..n {
        let (l, r) = (source.left[i] as f64, source.right[i] as f64);
        peak = peak.max(l.abs()).max(r.abs());
        energy += l * l + r * r;
        dl += l;
        dr += r;
        lr += l * r;
        ll += l * l;
        rr += r * r;
        clipped += u64::from(l.abs() >= 1.0) + u64::from(r.abs() >= 1.0);
        if l.abs().max(r.abs()) < 0.001 {
            silent += 1;
        }
        let (wl, wr) = (
            hp_l.filter(shelf_l.filter(l)),
            hp_r.filter(shelf_r.filter(r)),
        );
        weighted.push(weighted.last().copied().unwrap_or(0.0) + wl * wl + wr * wr);
    }
    let window = ((rate as f64 * 0.4).round() as usize).min(n).max(1);
    let step = (rate as usize / 10).max(1);
    let mut blocks = Vec::new();
    if n >= window {
        for start in (0..=n - window).step_by(step) {
            let e = (weighted[start + window] - weighted[start]) / window as f64;
            if -0.691 + 10.0 * e.max(1e-16).log10() > -70.0 {
                blocks.push(e);
            }
        }
    }
    let integrated_lufs = if blocks.is_empty() {
        None
    } else {
        let mean = blocks.iter().sum::<f64>() / blocks.len() as f64;
        let gate = mean * 0.1;
        let selected: Vec<_> = blocks.into_iter().filter(|e| *e >= gate).collect();
        Some(
            -0.691
                + 10.0
                    * (selected.iter().sum::<f64>() / selected.len() as f64)
                        .max(1e-16)
                        .log10(),
        )
    };
    let bins = n.min(1024);
    let waveform = (0..bins)
        .map(|i| {
            let a = i * n / bins;
            let b = ((i + 1) * n / bins).max(a + 1).min(n);
            WaveBin {
                left_min: source.left[a..b]
                    .iter()
                    .copied()
                    .fold(f32::INFINITY, f32::min),
                left_max: source.left[a..b]
                    .iter()
                    .copied()
                    .fold(f32::NEG_INFINITY, f32::max),
                right_min: source.right[a..b]
                    .iter()
                    .copied()
                    .fold(f32::INFINITY, f32::min),
                right_max: source.right[a..b]
                    .iter()
                    .copied()
                    .fold(f32::NEG_INFINITY, f32::max),
            }
        })
        .collect();
    let spectrum = spectrum(source, rate);
    let block = (rate as usize / 100).max(1);
    let mut prior = 0.0;
    let mut transient_secs = Vec::new();
    for start in (0..n).step_by(block) {
        let end = (start + block).min(n);
        let e = source.left[start..end]
            .iter()
            .zip(&source.right[start..end])
            .map(|(l, r)| ((*l as f64).powi(2) + (*r as f64).powi(2)) / 2.0)
            .sum::<f64>()
            / (end - start) as f64;
        if e > 0.0001
            && e > prior * 3.0
            && transient_secs
                .last()
                .is_none_or(|last| start as f64 / rate as f64 - last > 0.05)
        {
            transient_secs.push(start as f64 / rate as f64);
        }
        prior = e;
        if transient_secs.len() >= 512 {
            break;
        }
    }
    let rms = (energy / (n.max(1) * 2) as f64).sqrt();
    AudioAnalysis {
        sample_rate: rate,
        duration_secs: duration,
        peak_dbfs: db(peak),
        rms_dbfs: db(rms),
        crest_db: db(peak) - db(rms),
        integrated_lufs,
        dc_left: dl / n.max(1) as f64,
        dc_right: dr / n.max(1) as f64,
        stereo_correlation: if ll * rr > 1e-16 {
            (lr / (ll * rr).sqrt()).clamp(-1.0, 1.0)
        } else {
            0.0
        },
        clipped_samples: clipped,
        silence_secs: silent as f64 / rate as f64,
        waveform,
        spectrum,
        transient_secs,
    }
}
fn spectrum(source: &StereoSource, rate: u32) -> Vec<SpectrumBin> {
    let n = source.left.len().min(source.right.len());
    if n == 0 {
        return vec![];
    }
    let size = 4096;
    let mut planner = FftPlanner::<f64>::new();
    let fft = planner.plan_fft_forward(size);
    let mut energy = vec![0.0; size / 2];
    let blocks = n.div_ceil(size).min(64);
    let mut window_sum = 0.0;
    for block in 0..blocks {
        let start = if blocks > 1 {
            block * n.saturating_sub(size) / (blocks - 1)
        } else {
            0
        };
        let mut input = vec![Complex::new(0.0, 0.0); size];
        let mut right = input.clone();
        window_sum = 0.0;
        for (i, value) in input.iter_mut().enumerate() {
            let w = 0.5 - 0.5 * (2.0 * std::f64::consts::PI * i as f64 / (size - 1) as f64).cos();
            window_sum += w;
            if start + i < n {
                value.re = source.left[start + i] as f64 * w;
                right[i].re = source.right[start + i] as f64 * w;
            }
        }
        fft.process(&mut input);
        fft.process(&mut right);
        for (i, e) in energy.iter_mut().enumerate() {
            *e += (input[i].norm_sqr() + right[i].norm_sqr()) * 0.5;
        }
    }
    (1..size / 2)
        .map(|i| SpectrumBin {
            frequency_hz: i as f64 * rate as f64 / size as f64,
            dbfs: db((energy[i] / blocks as f64).sqrt() * 2.0 / window_sum),
        })
        .collect()
}
pub fn analyze_file(path: &Path) -> Result<AudioAnalysis, String> {
    let (rate, source) = decode_audio_stereo(path)?;
    if source.left.is_empty() {
        return Err("File contains no decodable audio".into());
    }
    Ok(analyze(&source, rate))
}
pub(crate) fn process(
    source: StereoSource,
    rate: u32,
    settings: &ProcessSettings,
) -> Result<(u32, StereoSource), String> {
    let numbers = [
        settings.start_secs,
        settings
            .end_secs
            .unwrap_or(source.left.len() as f64 / rate as f64),
        settings.gain_db,
        settings.fade_in_ms,
        settings.fade_out_ms,
        settings.compressor_ratio,
        settings.stretch_ratio,
    ];
    if numbers.iter().any(|n| !n.is_finite()) {
        return Err("All processing values must be finite".into());
    }
    if settings.start_secs < 0.0
        || settings.fade_in_ms < 0.0
        || settings.fade_out_ms < 0.0
        || !(0.5..=2.0).contains(&settings.stretch_ratio)
    {
        return Err("Invalid processing range, fade or stretch ratio".into());
    }
    let n = source.left.len().min(source.right.len());
    let start = (settings.start_secs * rate as f64).round() as usize;
    let end = (settings.end_secs.unwrap_or(n as f64 / rate as f64) * rate as f64).round() as usize;
    let end = end.min(n);
    if start >= end {
        return Err("Selection must contain audio".into());
    }
    let mut source = StereoSource {
        left: source.left[start..end].to_vec(),
        right: source.right[start..end].to_vec(),
    };
    if settings.reverse {
        source.left.reverse();
        source.right.reverse();
    }
    if (settings.stretch_ratio - 1.0).abs() > 1e-6 {
        source = super::stretch::stretch_stereo(&source, settings.stretch_ratio);
    }
    if settings.mono {
        for (l, r) in source.left.iter_mut().zip(&mut source.right) {
            let mono = (*l + *r) * 0.5;
            *l = mono;
            *r = mono;
        }
    }
    for (channel, invert) in [
        (&mut source.left, settings.invert_left),
        (&mut source.right, settings.invert_right),
    ] {
        for s in channel.iter_mut() {
            *s *=
                gain(settings.gain_db.clamp(-60.0, 24.0)) as f32 * if invert { -1.0 } else { 1.0 };
        }
        for (hz, kind) in [
            (settings.highpass_hz, "highpass"),
            (settings.lowpass_hz, "lowpass"),
        ] {
            if let Some(hz) = hz {
                if !hz.is_finite() || hz < 10.0 || hz >= rate as f64 / 2.0 {
                    return Err("Filter cutoff must be between 10 Hz and Nyquist".into());
                }
                let mut filter = Biquad::new(rate, hz, kind);
                for s in channel.iter_mut() {
                    *s = filter.filter(*s as f64) as f32;
                }
            }
        }
    }
    if let Some(threshold) = settings.compressor_threshold_db {
        if !threshold.is_finite() {
            return Err("Invalid compressor threshold".into());
        }
        let ratio = settings.compressor_ratio.clamp(1.0, 20.0);
        let attack = (-1.0 / (rate as f64 * 0.005)).exp();
        let release = (-1.0 / (rate as f64 * 0.08)).exp();
        let mut envelope = 0.0;
        for (l, r) in source.left.iter_mut().zip(&mut source.right) {
            let level = (*l as f64).abs().max((*r as f64).abs());
            let coefficient = if level > envelope { attack } else { release };
            envelope = coefficient * envelope + (1.0 - coefficient) * level;
            let over = (db(envelope) - threshold.clamp(-60.0, 0.0)).max(0.0);
            let g = gain(-over * (1.0 - 1.0 / ratio)) as f32;
            *l *= g;
            *r *= g;
        }
    }
    if let Some(target) = settings.normalize_dbfs {
        if !target.is_finite() || !(-60.0..=0.0).contains(&target) {
            return Err("Normalize target must be between -60 and 0 dBFS".into());
        }
        let peak = source
            .left
            .iter()
            .chain(&source.right)
            .map(|s| s.abs())
            .fold(0.0f32, f32::max);
        if peak > 1e-8 {
            let g = gain(target) as f32 / peak;
            for s in source.left.iter_mut().chain(&mut source.right) {
                *s *= g;
            }
        }
    }
    let n = source.left.len();
    let fade_in = settings.fade_in_ms / 1000.0 * rate as f64;
    let fade_out = settings.fade_out_ms / 1000.0 * rate as f64;
    for (i, (l, r)) in source.left.iter_mut().zip(&mut source.right).enumerate() {
        let a = if fade_in > 0.0 {
            (i as f64 / fade_in).min(1.0)
        } else {
            1.0
        };
        let b = if fade_out > 0.0 {
            ((n - 1 - i) as f64 / fade_out).min(1.0)
        } else {
            1.0
        };
        *l *= (a * b) as f32;
        *r *= (a * b) as f32;
    }
    let output_rate = settings.output_sample_rate.unwrap_or(rate);
    if !(8000..=192000).contains(&output_rate) {
        return Err("Output sample rate must be between 8 and 192 kHz".into());
    }
    let mut source = resample_stereo(&source, rate, output_rate);
    if let Some(ceiling) = settings.limiter_ceiling_dbfs {
        if !ceiling.is_finite() || !(-24.0..=0.0).contains(&ceiling) {
            return Err("Limiter ceiling must be between -24 and 0 dBFS".into());
        }
        let ceiling = gain(ceiling) as f32;
        for (l, r) in source.left.iter_mut().zip(&mut source.right) {
            let peak = l.abs().max(r.abs());
            if peak > ceiling {
                let g = ceiling / peak;
                *l *= g;
                *r *= g;
            }
        }
    }
    Ok((output_rate, source))
}
pub fn process_file(
    input: &Path,
    output: &Path,
    settings: &ProcessSettings,
) -> Result<LabResult, String> {
    if output
        .extension()
        .and_then(|e| e.to_str())
        .is_none_or(|e| !e.eq_ignore_ascii_case("wav"))
    {
        return Err("Export destination must be a WAV file".into());
    }
    if input == output
        || input
            .canonicalize()
            .ok()
            .zip(output.canonicalize().ok())
            .is_some_and(|(a, b)| a == b)
    {
        return Err("Choose a new destination; source audio is preserved".into());
    }
    let (rate, source) = decode_audio_stereo(input)?;
    let (rate, source) = process(source, rate, settings)?;
    save(output, rate, &source)?;
    Ok(LabResult {
        path: output.to_string_lossy().into(),
        analysis: analyze(&source, rate),
    })
}
pub(crate) fn generate(settings: &SignalSettings) -> Result<StereoSource, String> {
    if !(8000..=192000).contains(&settings.sample_rate)
        || !settings.duration_secs.is_finite()
        || !(0.01..=300.0).contains(&settings.duration_secs)
        || !settings.level_dbfs.is_finite()
        || !(-60.0..=0.0).contains(&settings.level_dbfs)
    {
        return Err(
            "Signal duration must be 0.01–300 seconds, level -60–0 dBFS and rate 8–192 kHz".into(),
        );
    }
    let frequencies = if settings.kind == "sweep" {
        vec![settings.frequency_hz, settings.end_frequency_hz]
    } else if ["sine", "square", "triangle"].contains(&settings.kind.as_str()) {
        vec![settings.frequency_hz]
    } else {
        vec![]
    };
    for frequency in frequencies {
        if !frequency.is_finite()
            || frequency < 1.0
            || frequency >= settings.sample_rate as f64 * 0.45
        {
            return Err("Signal frequencies must be between 1 Hz and 45% of sample rate".into());
        }
    }
    if ![
        "sine", "square", "triangle", "white", "pink", "sweep", "impulse",
    ]
    .contains(&settings.kind.as_str())
    {
        return Err("Unknown test signal".into());
    }
    let n = (settings.duration_secs * settings.sample_rate as f64).round() as usize;
    let mut samples = Vec::with_capacity(n);
    let (mut phase, mut random) = (0.0f64, 0x1234abcd_u32);
    let mut pink_rows = [0.0f64; 14];
    let amplitude = gain(settings.level_dbfs);
    for i in 0..n {
        random ^= random << 13;
        random ^= random >> 17;
        random ^= random << 5;
        let noise = random as f64 / u32::MAX as f64 * 2.0 - 1.0;
        let value = match settings.kind.as_str() {
            "square" => {
                if phase.sin() >= 0.0 {
                    1.0
                } else {
                    -1.0
                }
            }
            "triangle" => 2.0 / std::f64::consts::PI * phase.sin().asin(),
            "white" => noise,
            "pink" => {
                let row = (i + 1).trailing_zeros().min(13) as usize;
                pink_rows[row] = noise;
                (pink_rows.iter().sum::<f64>() + noise) / 15.0
            }
            "impulse" => {
                if i == 0 {
                    1.0
                } else {
                    0.0
                }
            }
            _ => phase.sin(),
        };
        samples.push((value * amplitude).clamp(-1.0, 1.0) as f32);
        let frequency = if settings.kind == "sweep" {
            settings.frequency_hz
                * (settings.end_frequency_hz / settings.frequency_hz).powf(i as f64 / n as f64)
        } else {
            settings.frequency_hz
        };
        phase = (phase + 2.0 * std::f64::consts::PI * frequency / settings.sample_rate as f64)
            .rem_euclid(2.0 * std::f64::consts::PI);
    }
    Ok(StereoSource {
        left: samples.clone(),
        right: samples,
    })
}
fn save(path: &Path, rate: u32, source: &StereoSource) -> Result<(), String> {
    let samples: Vec<_> = source
        .left
        .iter()
        .zip(&source.right)
        .flat_map(|(l, r)| [*l, *r])
        .collect();
    write_wav(path, rate, 2, &samples)
}
pub fn generate_file(path: &Path, settings: &SignalSettings) -> Result<LabResult, String> {
    if path
        .extension()
        .and_then(|e| e.to_str())
        .is_none_or(|e| !e.eq_ignore_ascii_case("wav"))
    {
        return Err("Signal destination must be a WAV file".into());
    }
    let source = generate(settings)?;
    save(path, settings.sample_rate, &source)?;
    Ok(LabResult {
        path: path.to_string_lossy().into(),
        analysis: analyze(&source, settings.sample_rate),
    })
}
pub fn preview_file(path: &Path, settings: &ProcessSettings) -> Result<(u32, Vec<f32>), String> {
    let (rate, source) = decode_audio_stereo(path)?;
    let (rate, source) = process(source, rate, settings)?;
    Ok((
        rate,
        source
            .left
            .iter()
            .zip(&source.right)
            .flat_map(|(l, r)| [*l, *r])
            .collect(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn tone() -> StereoSource {
        generate(&SignalSettings {
            kind: "sine".into(),
            duration_secs: 1.0,
            frequency_hz: 1000.0,
            end_frequency_hz: 1000.0,
            level_dbfs: -12.0,
            sample_rate: 48000,
        })
        .unwrap()
    }
    #[test]
    fn analysis_matches_tone_level_and_frequency() {
        let a = analyze(&tone(), 48000);
        assert!((a.peak_dbfs + 12.0).abs() < 0.01);
        assert!((a.rms_dbfs + 15.0103).abs() < 0.01);
        assert!(a.stereo_correlation > 0.999);
        let peak = a
            .spectrum
            .iter()
            .max_by(|a, b| a.dbfs.total_cmp(&b.dbfs))
            .unwrap();
        assert!((peak.frequency_hz - 1000.0).abs() < 12.0);
        assert!(a.integrated_lufs.is_some());
    }
    #[test]
    fn spectrum_retains_anti_phase_stereo_energy() {
        let mut source = tone();
        source.right.iter_mut().for_each(|s| *s = -*s);
        let analysis = analyze(&source, 48000);
        assert!(analysis.stereo_correlation < -0.999);
        let peak = analysis
            .spectrum
            .iter()
            .max_by(|a, b| a.dbfs.total_cmp(&b.dbfs))
            .unwrap();
        assert!((peak.frequency_hz - 1000.0).abs() < 12.0);
        assert!(peak.dbfs > -14.0);
    }
    #[test]
    fn silence_has_no_loudness_or_nan() {
        let a = analyze(
            &StereoSource {
                left: vec![0.0; 48000],
                right: vec![0.0; 48000],
            },
            48000,
        );
        assert_eq!(a.integrated_lufs, None);
        assert!(a.peak_dbfs.is_finite());
        assert_eq!(a.silence_secs, 1.0);
    }
    #[test]
    fn normalize_trim_and_fade_are_applied() {
        let settings = ProcessSettings {
            start_secs: 0.2,
            end_secs: Some(0.7),
            normalize_dbfs: Some(-1.0),
            fade_in_ms: 5.0,
            fade_out_ms: 5.0,
            ..Default::default()
        };
        let (rate, p) = process(tone(), 48000, &settings).unwrap();
        assert_eq!(p.left.len(), 24000);
        assert_eq!(p.left[0], 0.0);
        assert_eq!(*p.left.last().unwrap(), 0.0);
        assert!((analyze(&p, rate).peak_dbfs + 1.0).abs() < 0.02);
    }
    #[test]
    fn limiter_preserves_stereo_balance() {
        let source = StereoSource {
            left: vec![2.0; 32],
            right: vec![1.0; 32],
        };
        let (_, p) = process(
            source,
            48000,
            &ProcessSettings {
                limiter_ceiling_dbfs: Some(-6.0),
                ..Default::default()
            },
        )
        .unwrap();
        assert!((p.left[0] - 0.501187).abs() < 1e-5);
        assert!((p.left[0] / p.right[0] - 2.0).abs() < 1e-5);
    }
    #[test]
    fn invalid_selection_is_rejected() {
        assert!(process(
            tone(),
            48000,
            &ProcessSettings {
                start_secs: 2.0,
                ..Default::default()
            }
        )
        .is_err());
    }
}
