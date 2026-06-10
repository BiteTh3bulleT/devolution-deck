//! Audio recording state models.

use serde::{Deserialize, Serialize};

/// Snapshot of current recording state, serialisable for frontend polling.
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingInfo {
    pub is_recording: bool,
    pub input_device_name: Option<String>,
    /// Absolute path to the in-progress or completed WAV file.
    pub output_path: Option<String>,
}
