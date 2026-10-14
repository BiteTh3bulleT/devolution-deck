//! Audio engine abstraction: playback, waveform generation, and recording.

#[allow(dead_code)]
mod deck_engine;
pub mod editing;
pub mod engine;
pub mod lab;
pub mod output;
mod playback_live;
pub mod recording;
mod render;
mod stretch;
mod vst_host;
mod waveform;

pub(crate) use deck_engine::prepare_live_decks;
pub use engine::export_project_mixdown_to_wav;
pub use playback_live::PlaybackHandle;
pub(crate) use playback_live::PlayingDeck;
pub use render::{
    render_playback_preview, render_project_track_pre_mixer, render_project_tracks, write_wav,
    RenderedTrack,
};
pub use vst_host::preflight_plugin;
pub use waveform::compute_waveform_peaks;
#[cfg(test)]
mod regression_tests;
