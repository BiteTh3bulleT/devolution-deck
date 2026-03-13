//! Tauri commands: project, media, transport, waveform.

use crate::audio::{compute_waveform_peaks, PlaybackHandle};
use crate::models::{MediaAsset, Project, TimelineClip, Track};
use crate::project_io;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

pub struct AppState {
    pub project: Mutex<Project>,
    pub project_path: Mutex<Option<PathBuf>>,
    pub playback: PlaybackHandle,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WaveformPeaksPayload {
    pub sample_rate: u32,
    pub duration_secs: f64,
    pub buckets: Vec<WaveformBucketPayload>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WaveformBucketPayload {
    pub min: f32,
    pub max: f32,
}

#[derive(Debug, Deserialize)]
pub struct ImportAudioPayload {
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct PlaceClipPayload {
    pub media_asset_id: String,
    pub track_index: u32,
    pub start_secs: f64,
    pub source_offset_secs: f64,
    pub duration_secs: f64,
}

#[derive(Debug, Deserialize)]
pub struct PlayClipPayload {
    pub path: String,
    pub offset_secs: f64,
    pub duration_secs: f64,
}

/// Create new project (in-memory).
#[tauri::command]
pub fn project_new(state: State<AppState>) -> Result<Project, String> {
    let project = Project::default();
    let out = project.clone();
    *state.project.lock().map_err(|_| "lock")? = project;
    *state.project_path.lock().map_err(|_| "lock")? = None;
    Ok(out)
}

/// Save project to path.
#[tauri::command]
pub fn project_save(state: State<AppState>, path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    let project = state.project.lock().map_err(|_| "lock")?;
    project_io::save_project(&project, &path_buf)?;
    drop(project);
    *state.project_path.lock().map_err(|_| "lock")? = Some(path_buf);
    Ok(())
}

/// Open project from path.
#[tauri::command]
pub fn project_open(state: State<AppState>, path: String) -> Result<Project, String> {
    let path_buf = PathBuf::from(&path);
    let project = project_io::load_project(&path_buf)?;
    let out = project.clone();
    *state.project.lock().map_err(|_| "lock")? = project;
    *state.project_path.lock().map_err(|_| "lock")? = Some(path_buf);
    Ok(out)
}

/// Get current project.
#[tauri::command]
pub fn project_get(state: State<AppState>) -> Result<Project, String> {
    let project = state.project.lock().map_err(|_| "lock")?;
    Ok(project.clone())
}

/// Update project (e.g. title, bpm). Full replace for Phase 1.
#[tauri::command]
pub fn project_update(state: State<AppState>, project: Project) -> Result<Project, String> {
    let out = project.clone();
    *state.project.lock().map_err(|_| "lock")? = project;
    Ok(out)
}

/// Import audio file: read metadata, add to project media, return asset.
#[tauri::command]
pub fn media_import_audio(state: State<AppState>, path: String) -> Result<MediaAsset, String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.exists() {
        return Err("File not found".to_string());
    }
    let peaks = compute_waveform_peaks(&path_buf, 1)?;
    let name = path_buf
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("audio")
        .to_string();
    let asset = MediaAsset {
        id: Uuid::new_v4().to_string(),
        name: name.clone(),
        path: path_buf.to_string_lossy().to_string(),
        duration_secs: peaks.duration_secs,
        sample_rate: peaks.sample_rate,
        channels: peaks.channels,
    };
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.media.push(asset.clone());
    Ok(asset)
}

/// Get waveform peaks for a media file (by path). Used when drawing clip waveforms.
#[tauri::command]
pub fn waveform_peaks(path: String, num_buckets: usize) -> Result<WaveformPeaksPayload, String> {
    let path_buf = PathBuf::from(&path);
    let peaks = compute_waveform_peaks(&path_buf, num_buckets.max(2).min(4096))?;
    Ok(WaveformPeaksPayload {
        sample_rate: peaks.sample_rate,
        duration_secs: peaks.duration_secs,
        buckets: peaks
            .buckets
            .into_iter()
            .map(|b| WaveformBucketPayload { min: b.min, max: b.max })
            .collect(),
    })
}

/// Add a track.
#[tauri::command]
pub fn track_add(state: State<AppState>, name: String) -> Result<Track, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let index = project.tracks.len() as u32;
    let track = Track {
        id: Uuid::new_v4().to_string(),
        name: if name.is_empty() {
            format!("Track {}", index + 1)
        } else {
            name
        },
        index,
        clips: vec![],
    };
    project.tracks.push(track.clone());
    Ok(track)
}

/// Place a clip on a track.
#[tauri::command]
pub fn clip_place(state: State<AppState>, payload: PlaceClipPayload) -> Result<TimelineClip, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let track = project
        .tracks
        .get_mut(payload.track_index as usize)
        .ok_or("Track not found")?;
    let clip = TimelineClip {
        id: Uuid::new_v4().to_string(),
        media_asset_id: payload.media_asset_id,
        start_secs: payload.start_secs,
        source_offset_secs: payload.source_offset_secs,
        duration_secs: payload.duration_secs,
    };
    track.clips.push(clip.clone());
    Ok(clip)
}

/// Play audio (path, offset, duration). Used for transport play with first clip.
#[tauri::command]
pub fn playback_play(state: State<AppState>, payload: PlayClipPayload) -> Result<(), String> {
    let path = PathBuf::from(&payload.path);
    state.playback.play(&path, payload.offset_secs, payload.duration_secs)
}

/// Stop playback.
#[tauri::command]
pub fn playback_stop(state: State<AppState>) -> Result<(), String> {
    state.playback.stop();
    Ok(())
}

/// Get current position in ms.
#[tauri::command]
pub fn playback_position_ms(state: State<AppState>) -> Result<u64, String> {
    Ok(state.playback.position_ms())
}

/// Check if playing.
#[tauri::command]
pub fn playback_is_playing(state: State<AppState>) -> Result<bool, String> {
    Ok(state.playback.is_playing())
}
