//! Audio engine abstraction: playback and waveform generation.
//! Phase 1: basic file playback and peak data for waveforms.
//! Designed for future: mixer, plugins, multi-track playback.

mod playback;
mod waveform;

pub use playback::PlaybackHandle;
pub use waveform::compute_waveform_peaks;
