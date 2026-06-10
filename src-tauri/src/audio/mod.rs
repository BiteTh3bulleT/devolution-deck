//! Audio engine abstraction: playback, waveform generation, and recording.

pub mod engine;
mod playback;
pub mod recording;
mod render;
mod vst_host;
mod waveform;

pub use engine::export_project_mixdown_to_wav;
pub use playback::PlaybackHandle;
pub use render::{
    render_playback_preview, render_project_track, render_project_tracks, write_wav,
    RenderedTrack,
};
pub use waveform::compute_waveform_peaks;
