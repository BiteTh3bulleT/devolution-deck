//! Audio engine abstraction: playback, waveform generation, and recording.

pub mod engine;
mod playback;
pub mod recording;
mod render;
mod vst_host;
mod waveform;

pub use engine::{export_project_mixdown_to_wav, render_project_for_realtime_playback};
pub use playback::PlaybackHandle;
pub use render::{
    render_playback_preview, render_project_track, render_project_tracks, write_wav_mono,
    RenderedTrack,
};
pub use waveform::compute_waveform_peaks;
