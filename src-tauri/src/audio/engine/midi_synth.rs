//! Built-in MIDI voices rendered at engine-clock positions.
//! Used by the shared arrangement render, so live playback and export get
//! identical MIDI output by construction.

use crate::models::MidiClip;

/// Which built-in voice renders a track's MIDI clips.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MidiVoice {
    /// Sine synth with attack/release envelope.
    Synth,
    /// Pitch-mapped drum voices (kick / snare / hat zones).
    Drums,
}

impl MidiVoice {
    pub fn from_plugin_type(plugin_type: Option<&str>) -> Self {
        match plugin_type {
            Some("builtin_drums") => MidiVoice::Drums,
            _ => MidiVoice::Synth,
        }
    }
}

/// Render one MIDI clip into a mono buffer at the engine sample rate.
pub fn synth_midi_clip(
    track_buffer: &mut [f32],
    clip: &MidiClip,
    voice: MidiVoice,
    bpm: f64,
    sample_rate: u32,
) {
    let ticks_per_sec = (bpm / 60.0) * crate::models::TICKS_PER_BEAT as f64;
    let clip_start_sample = (clip.start_secs * sample_rate as f64) as isize;

    for note in &clip.notes {
        let start_secs = note.start_ticks as f64 / ticks_per_sec;
        let dur_secs = note.duration_ticks as f64 / ticks_per_sec;
        let amp = (note.velocity as f32 / 127.0) * 0.18;
        let note_start = clip_start_sample + (start_secs * sample_rate as f64) as isize;
        let note_len = (dur_secs * sample_rate as f64) as usize;

        for n in 0..note_len {
            let di = note_start + n as isize;
            if di < 0 {
                continue;
            }
            let di = di as usize;
            if di >= track_buffer.len() {
                break;
            }
            let t = n as f32 / sample_rate as f32;
            let remaining = (note_len - n) as f32 / sample_rate as f32;
            let envelope = attack_release(t, remaining, 0.005, 0.01);
            let sample = match voice {
                MidiVoice::Synth => {
                    let freq = 440.0f32 * (2.0f32).powf((note.pitch as f32 - 69.0) / 12.0);
                    (2.0 * std::f32::consts::PI * freq * t).sin()
                }
                MidiVoice::Drums => drum_sample(note.pitch, t),
            };
            track_buffer[di] += sample * amp * envelope;
        }
    }
}

fn attack_release(t: f32, remaining: f32, attack: f32, release: f32) -> f32 {
    let a = if t < attack { t / attack } else { 1.0 };
    let r = if remaining < release {
        (remaining / release).max(0.0)
    } else {
        1.0
    };
    a * r
}

/// Deterministic noise in [-1, 1] derived from a sample index.
fn noise(seed: u32) -> f32 {
    let mut x = seed.wrapping_mul(1664525).wrapping_add(1013904223);
    x ^= x >> 16;
    (x as f32 / u32::MAX as f32) * 2.0 - 1.0
}

/// Drum voices by General-MIDI-ish pitch zones:
/// - below 38: kick (pitch-swept sine with fast decay)
/// - 38..=49: snare (tone + noise burst)
/// - 50 and above: hat (short noise tick)
fn drum_sample(pitch: u8, t: f32) -> f32 {
    if pitch < 38 {
        let freq = 110.0 * (-t * 18.0).exp() + 45.0;
        let decay = (-t * 14.0).exp();
        (2.0 * std::f32::consts::PI * freq * t).sin() * decay
    } else if pitch <= 49 {
        let tone = (2.0 * std::f32::consts::PI * 190.0 * t).sin() * 0.4;
        let burst = noise((t * 48000.0) as u32 ^ (pitch as u32) << 8) * 0.8;
        (tone + burst) * (-t * 22.0).exp()
    } else {
        noise((t * 48000.0) as u32 ^ (pitch as u32) << 12) * (-t * 60.0).exp() * 0.7
    }
}

#[cfg(test)]
mod tests {
    use super::{synth_midi_clip, MidiVoice};
    use crate::models::midi::MidiNote;
    use crate::models::{MidiClip, TICKS_PER_BEAT};

    fn clip_with_note(pitch: u8, velocity: u8) -> MidiClip {
        MidiClip {
            id: "clip".to_string(),
            start_secs: 0.5,
            duration_secs: 1.0,
            notes: vec![MidiNote {
                id: "note".to_string(),
                pitch,
                start_ticks: 0,
                duration_ticks: TICKS_PER_BEAT,
                velocity,
            }],
            loop_clip: false,
        }
    }

    fn peak(buffer: &[f32]) -> f32 {
        buffer.iter().fold(0.0f32, |m, s| m.max(s.abs()))
    }

    #[test]
    fn synth_voice_renders_audio_only_inside_note_span() {
        let sr = 8000u32;
        let mut buffer = vec![0.0f32; sr as usize * 2];
        // 120 bpm: one beat = 0.5 s; note spans 0.5s..1.0s on the timeline.
        synth_midi_clip(&mut buffer, &clip_with_note(69, 100), MidiVoice::Synth, 120.0, sr);

        let before = peak(&buffer[..3500]);
        let during = peak(&buffer[4400..7600]);
        assert_eq!(before, 0.0, "audio before note start");
        assert!(during > 0.05, "note produced no audio: {during}");
    }

    #[test]
    fn velocity_scales_amplitude() {
        let sr = 8000u32;
        let mut loud = vec![0.0f32; sr as usize * 2];
        let mut quiet = vec![0.0f32; sr as usize * 2];
        synth_midi_clip(&mut loud, &clip_with_note(69, 127), MidiVoice::Synth, 120.0, sr);
        synth_midi_clip(&mut quiet, &clip_with_note(69, 32), MidiVoice::Synth, 120.0, sr);
        assert!(
            peak(&loud) > peak(&quiet) * 2.0,
            "velocity must scale level: loud {} quiet {}",
            peak(&loud),
            peak(&quiet)
        );
    }

    #[test]
    fn drum_voice_differs_from_synth_voice() {
        let sr = 8000u32;
        let mut synth = vec![0.0f32; sr as usize * 2];
        let mut drums = vec![0.0f32; sr as usize * 2];
        synth_midi_clip(&mut synth, &clip_with_note(36, 100), MidiVoice::Synth, 120.0, sr);
        synth_midi_clip(&mut drums, &clip_with_note(36, 100), MidiVoice::Drums, 120.0, sr);
        assert!(peak(&drums) > 0.05, "kick produced no audio");
        assert_ne!(synth, drums, "drum voice must not be the synth voice");
    }

    #[test]
    fn voice_selection_follows_instrument_plugin_type() {
        assert_eq!(
            MidiVoice::from_plugin_type(Some("builtin_drums")),
            MidiVoice::Drums
        );
        assert_eq!(
            MidiVoice::from_plugin_type(Some("builtin_synth")),
            MidiVoice::Synth
        );
        assert_eq!(MidiVoice::from_plugin_type(None), MidiVoice::Synth);
    }
}
