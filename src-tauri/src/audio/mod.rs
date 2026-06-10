//! Audio engine abstraction: playback, waveform generation, and recording.

mod playback;
pub mod recording;
mod render;
mod vst_host;
mod waveform;

pub use playback::PlaybackHandle;
pub use render::{
    render_playback_preview, render_project_track, render_project_tracks, write_wav_mono,
};
pub use waveform::compute_waveform_peaks;
