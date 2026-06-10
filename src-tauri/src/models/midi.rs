//! MIDI note and clip models.

use serde::{Deserialize, Serialize};

/// Ticks per beat (quarter note). Standard PPQ for DEVOLUTION//DECK.
pub const TICKS_PER_BEAT: u32 = 480;

/// A single MIDI note event within a clip.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiNote {
    pub id: String,
    /// MIDI pitch 0–127 (60 = middle C).
    pub pitch: u8,
    /// Start position within the clip in ticks.
    pub start_ticks: u32,
    /// Duration in ticks.
    pub duration_ticks: u32,
    /// Velocity 0–127.
    pub velocity: u8,
}

/// A MIDI clip placed on a MIDI track. Contains notes in tick-space.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiClip {
    pub id: String,
    /// Position on the arrangement timeline in seconds.
    pub start_secs: f64,
    /// Clip duration on the timeline in seconds.
    pub duration_secs: f64,
    /// MIDI notes within this clip.
    pub notes: Vec<MidiNote>,
    /// If true, the clip loops when it reaches its end during playback.
    pub loop_clip: bool,
}
