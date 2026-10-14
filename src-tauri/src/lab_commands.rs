use crate::{
    audio::lab::{self, AudioAnalysis, LabResult, ProcessSettings, SignalSettings},
    commands::AppState,
};
use std::path::PathBuf;
use tauri::State;
#[tauri::command]
pub async fn audio_lab_analyze(path: String) -> Result<AudioAnalysis, String> {
    tauri::async_runtime::spawn_blocking(move || lab::analyze_file(&PathBuf::from(path)))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn audio_lab_process(
    input_path: String,
    output_path: String,
    settings: ProcessSettings,
) -> Result<LabResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        lab::process_file(
            &PathBuf::from(input_path),
            &PathBuf::from(output_path),
            &settings,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn audio_lab_generate(
    output_path: String,
    settings: SignalSettings,
) -> Result<LabResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        lab::generate_file(&PathBuf::from(output_path), &settings)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn audio_lab_preview(
    state: State<'_, AppState>,
    path: String,
    settings: ProcessSettings,
) -> Result<(), String> {
    let (rate, samples) = tauri::async_runtime::spawn_blocking(move || {
        lab::preview_file(&PathBuf::from(path), &settings)
    })
    .await
    .map_err(|e| e.to_string())??;
    {
        let mut project = state.project.lock().map_err(|_| "lock")?;
        for deck in &mut project.decks {
            deck.playing = false;
        }
    }
    *state.meter_source.lock().map_err(|_| "lock")? = None;
    state.playback.play_samples(samples, rate, 2, 0.0)
}
#[derive(serde::Serialize)]
pub struct LabDevice {
    pub name: String,
    pub direction: String,
    pub is_default: bool,
    pub sample_rates: Vec<u32>,
    pub channels: Vec<u16>,
    pub formats: Vec<String>,
}
#[tauri::command]
pub async fn audio_lab_devices() -> Result<Vec<LabDevice>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        use cpal::traits::{DeviceTrait, HostTrait};
        let host = cpal::default_host();
        let mut out = Vec::new();
        for direction in ["input", "output"] {
            let default = if direction == "input" {
                host.default_input_device()
            } else {
                host.default_output_device()
            }
            .and_then(|d| d.name().ok());
            let devices = if direction == "input" {
                host.input_devices()
            } else {
                host.output_devices()
            }
            .map_err(|e| e.to_string())?;
            for device in devices {
                let name = device.name().map_err(|e| e.to_string())?;
                let configs: Vec<_> = if direction == "input" {
                    device
                        .supported_input_configs()
                        .map_err(|e| e.to_string())?
                        .collect()
                } else {
                    device
                        .supported_output_configs()
                        .map_err(|e| e.to_string())?
                        .collect()
                };
                let (mut sample_rates, mut channels, mut formats) =
                    (Vec::new(), Vec::new(), Vec::new());
                for config in configs {
                    for rate in [config.min_sample_rate().0, config.max_sample_rate().0] {
                        if !sample_rates.contains(&rate) {
                            sample_rates.push(rate);
                        }
                    }
                    if !channels.contains(&config.channels()) {
                        channels.push(config.channels());
                    }
                    let format = format!("{:?}", config.sample_format());
                    if !formats.contains(&format) {
                        formats.push(format);
                    }
                }
                sample_rates.sort();
                channels.sort();
                out.push(LabDevice {
                    name: name.clone(),
                    direction: direction.into(),
                    is_default: default.as_ref() == Some(&name),
                    sample_rates,
                    channels,
                    formats,
                });
            }
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}
