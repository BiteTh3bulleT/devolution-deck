//! Project, track, clip, and media asset models.

use serde::{Deserialize, Serialize};

/// Project file schema version for forward compatibility. Re-exported for project_io.
pub const PROJECT_SCHEMA_VERSION: u32 = 1;

/// Root project container. Persisted to disk as JSON.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub version: u32,
    pub title: String,
    pub bpm: f64,
    /// Sample rate used for timeline (e.g. 44100). Used for time↔sample conversion.
    pub sample_rate: u32,
    /// Media assets (imported files) referenced by clips.
    pub media: Vec<MediaAsset>,
    /// Arrangement tracks.
    pub tracks: Vec<Track>,
}

impl Default for Project {
    fn default() -> Self {
        Self {
            version: PROJECT_SCHEMA_VERSION,
            title: "Untitled".to_string(),
            bpm: 120.0,
            sample_rate: 44100,
            media: Vec::new(),
            tracks: Vec::new(),
        }
    }
}

/// Imported audio/file asset. Stored in project; path may be relative to project dir.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaAsset {
    pub id: String,
    /// Display name (e.g. filename).
    pub name: String,
    /// Absolute path at import time, or path relative to project file for portability.
    pub path: String,
    /// Duration in seconds.
    pub duration_secs: f64,
    /// Sample rate of the file.
    pub sample_rate: u32,
    /// Number of channels.
    pub channels: u16,
}

/// A single track in the arrangement.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub id: String,
    pub name: String,
    /// 0-based order in arrangement.
    pub index: u32,
    pub clips: Vec<TimelineClip>,
}

/// A clip placed on the timeline (references a media asset).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineClip {
    pub id: String,
    /// Reference to MediaAsset.id.
    pub media_asset_id: String,
    /// Start time on the timeline in seconds.
    pub start_secs: f64,
    /// Offset into the source media in seconds (for trim).
    pub source_offset_secs: f64,
    /// Duration of the clip on the timeline in seconds.
    pub duration_secs: f64,
}
