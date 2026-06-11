use crate::models::LoopState;
use crate::models::Project;
use std::path::Path;

#[derive(Debug, Clone)]
pub(crate) struct DeckAudioSource {
    pub left: Vec<f32>,
    pub right: Vec<f32>,
}

pub(crate) struct DeckMixSource<'a> {
    pub id: &'a str,
    pub source: &'a DeckAudioSource,
    pub position_secs: f64,
    pub tempo_multiplier: f64,
    pub gain_db: f64,
    pub side_gain: f64,
    pub loop_state: Option<&'a LoopState>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct DeckMixBuffer {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
    pub channels: u16,
    pub timeline_start_secs: f64,
    pub deck_ids: Vec<String>,
}

fn db_to_gain(db: f64) -> f32 {
    (10f64.powf(db / 20.0)) as f32
}

fn clip_sample(value: f32) -> f32 {
    value.clamp(-1.0, 1.0)
}

fn source_frame_count(source: &DeckAudioSource) -> usize {
    source.left.len().min(source.right.len())
}

fn looped_frame_position(position: f64, loop_state: Option<&LoopState>, sample_rate: u32) -> f64 {
    let Some(loop_state) = loop_state.filter(|state| state.enabled) else {
        return position;
    };

    let start = (loop_state.start_secs.max(0.0) * sample_rate as f64).round();
    let end = (loop_state.end_secs.max(loop_state.start_secs) * sample_rate as f64).round();
    let len = end - start;
    if len <= 0.0 || position < end {
        return position;
    }

    start + (position - start).rem_euclid(len)
}

fn sample_channel(samples: &[f32], frame_position: f64) -> Option<f32> {
    if samples.is_empty() || frame_position < 0.0 {
        return None;
    }
    let i0 = frame_position.floor() as usize;
    if i0 >= samples.len() {
        return None;
    }
    let i1 = (i0 + 1).min(samples.len() - 1);
    let frac = (frame_position - i0 as f64) as f32;
    Some(samples[i0] * (1.0 - frac) + samples[i1] * frac)
}

pub(crate) fn mix_deck_sources(
    sources: &[DeckMixSource<'_>],
    sample_rate: u32,
    duration_secs: f64,
) -> Result<DeckMixBuffer, String> {
    let sample_rate = sample_rate.max(1);
    let frames = (duration_secs.max(0.0) * sample_rate as f64).round() as usize;
    if frames == 0 {
        return Err("Deck mix duration must be positive".to_string());
    }
    if sources.is_empty() {
        return Err("No playing decks with loaded audio".to_string());
    }

    let mut samples = vec![0.0f32; frames * 2];
    let mut deck_ids = Vec::new();

    for source in sources {
        let frame_count = source_frame_count(source.source);
        if frame_count == 0 {
            continue;
        }
        deck_ids.push(source.id.to_string());
        let gain = db_to_gain(source.gain_db) * source.side_gain.clamp(0.0, 1.0) as f32;
        let start_frame = source.position_secs.max(0.0) * sample_rate as f64;
        let speed = source.tempo_multiplier.clamp(0.25, 4.0);

        for frame in 0..frames {
            let src_pos = looped_frame_position(
                start_frame + frame as f64 * speed,
                source.loop_state,
                sample_rate,
            );
            if src_pos >= frame_count as f64 {
                continue;
            }
            let Some(left) = sample_channel(&source.source.left, src_pos) else {
                continue;
            };
            let Some(right) = sample_channel(&source.source.right, src_pos) else {
                continue;
            };
            let out = frame * 2;
            samples[out] += left * gain;
            samples[out + 1] += right * gain;
        }
    }

    if deck_ids.is_empty() {
        return Err("No deck audio could be rendered".to_string());
    }

    for sample in &mut samples {
        *sample = clip_sample(*sample);
    }

    Ok(DeckMixBuffer {
        samples,
        sample_rate,
        channels: 2,
        timeline_start_secs: 0.0,
        deck_ids,
    })
}

fn crossfader_gain_for_deck(project: &Project, deck_id: &str) -> f64 {
    let (gain_a, gain_b) =
        crate::deck::crossfader_gains(project.crossfader.position, project.crossfader.curve);
    if deck_id.eq_ignore_ascii_case("A") {
        gain_a
    } else if deck_id.eq_ignore_ascii_case("B") {
        gain_b
    } else {
        gain_a.max(gain_b)
    }
}

pub(crate) fn render_project_deck_mix(
    project: &Project,
    duration_secs: f64,
) -> Result<DeckMixBuffer, String> {
    let sample_rate = project.sample_rate.max(8000);
    let mut decoded = Vec::<(String, DeckAudioSource, f64, f64, f64, Option<LoopState>)>::new();

    for deck in project.decks.iter().filter(|deck| deck.playing) {
        let reference = deck
            .loaded_track
            .as_ref()
            .ok_or_else(|| format!("Deck {} is marked playing but has no loaded track", deck.id))?;
        let asset = project
            .media
            .iter()
            .find(|asset| asset.id == reference.media_asset_id)
            .ok_or_else(|| format!("Deck {} media asset not found", deck.id))?;
        let (source_rate, source) = super::render::decode_audio_stereo(Path::new(&asset.path))
            .map_err(|error| format!("Deck {} decode failed: {error}", deck.id))?;
        let source = super::render::resample_stereo(&source, source_rate, sample_rate);
        decoded.push((
            deck.id.clone(),
            DeckAudioSource {
                left: source.left,
                right: source.right,
            },
            deck.position_secs,
            deck.tempo_multiplier,
            deck.gain_db,
            deck.loop_state.clone(),
        ));
    }

    if decoded.is_empty() {
        return Err("No playing decks with loaded audio".to_string());
    }

    let sources = decoded
        .iter()
        .map(
            |(id, source, position_secs, tempo_multiplier, gain_db, loop_state)| DeckMixSource {
                id,
                source,
                position_secs: *position_secs,
                tempo_multiplier: *tempo_multiplier,
                gain_db: *gain_db,
                side_gain: crossfader_gain_for_deck(project, id),
                loop_state: loop_state.as_ref(),
            },
        )
        .collect::<Vec<_>>();

    mix_deck_sources(&sources, sample_rate, duration_secs)
}

#[cfg(test)]
mod tests {
    use crate::models::LoopState;

    fn source(left: &[f32], right: &[f32]) -> super::DeckAudioSource {
        super::DeckAudioSource {
            left: left.to_vec(),
            right: right.to_vec(),
        }
    }

    #[test]
    fn crossfader_mix_sums_playing_decks_with_side_gains() {
        let source_a = source(&[1.0, 1.0, 1.0], &[0.5, 0.5, 0.5]);
        let source_b = source(&[0.5, 0.5, 0.5], &[1.0, 1.0, 1.0]);
        let deck_a = super::DeckMixSource {
            id: "A",
            source: &source_a,
            position_secs: 0.0,
            tempo_multiplier: 1.0,
            gain_db: 0.0,
            side_gain: 0.25,
            loop_state: None,
        };
        let deck_b = super::DeckMixSource {
            id: "B",
            source: &source_b,
            position_secs: 0.0,
            tempo_multiplier: 1.0,
            gain_db: 0.0,
            side_gain: 0.5,
            loop_state: None,
        };

        let mix = super::mix_deck_sources(&[deck_a, deck_b], 2, 1.0).expect("deck mix");

        assert_eq!(mix.sample_rate, 2);
        assert_eq!(mix.channels, 2);
        assert_eq!(mix.samples, vec![0.5, 0.625, 0.5, 0.625]);
        assert_eq!(mix.deck_ids, vec!["A".to_string(), "B".to_string()]);
    }

    #[test]
    fn loop_state_wraps_deck_audio_inside_loop_region() {
        let loop_state = LoopState {
            enabled: true,
            start_secs: 1.0,
            end_secs: 3.0,
            quantize_beats: 4,
        };
        let audio = source(&[0.0, 0.2, 0.4, 0.6], &[0.0, 0.3, 0.5, 0.7]);
        let deck = super::DeckMixSource {
            id: "A",
            source: &audio,
            position_secs: 2.0,
            tempo_multiplier: 1.0,
            gain_db: 0.0,
            side_gain: 1.0,
            loop_state: Some(&loop_state),
        };

        let mix = super::mix_deck_sources(&[deck], 1, 4.0).expect("looped mix");

        assert_eq!(mix.samples, vec![0.4, 0.5, 0.2, 0.3, 0.4, 0.5, 0.2, 0.3]);
    }
}
