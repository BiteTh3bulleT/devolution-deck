//! Audio engine abstraction: playback, waveform generation, and recording.

mod deck_engine;
pub mod engine;
mod playback;
pub mod recording;
mod render;
mod vst_host;
mod waveform;

pub(crate) use deck_engine::{render_project_deck_mix, DeckMixBuffer};
pub use engine::export_project_mixdown_to_wav;
pub use playback::PlaybackHandle;
pub use render::{
    render_playback_preview, render_project_track, render_project_tracks, write_wav, RenderedTrack,
};
pub use vst_host::preflight_plugin;
pub use waveform::compute_waveform_peaks;
