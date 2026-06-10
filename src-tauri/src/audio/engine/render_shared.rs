//! Shared live/export arrangement mixdown helpers.

use super::super::render::RenderedTrack;

#[derive(Debug, Clone, PartialEq)]
pub struct ArrangementMixdownBuffer {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
    pub channels: u16,
    pub timeline_start_secs: f64,
}

fn clip_sample(value: f32) -> f32 {
    value.clamp(-1.0, 1.0)
}

fn timeline_sample_index(seconds: f64, sample_rate: u32) -> usize {
    (seconds.max(0.0) * sample_rate.max(1) as f64).round() as usize
}

fn db_to_gain(db: f64) -> f32 {
    (10f64.powf(db / 20.0)) as f32
}

pub fn mix_rendered_tracks(
    rendered_tracks: &[RenderedTrack],
    sample_rate: u32,
    start_secs: f64,
    end_secs: Option<f64>,
    master_gain_db: f64,
) -> Result<ArrangementMixdownBuffer, String> {
    let master_gain = db_to_gain(master_gain_db);
    if rendered_tracks.is_empty() {
        return Err("No rendered tracks available for mixdown".to_string());
    }

    let sample_rate = sample_rate.max(1);
    let start_secs = start_secs.max(0.0);
    let start_sample = timeline_sample_index(start_secs, sample_rate);
    let longest = rendered_tracks
        .iter()
        .map(|track| track.samples.len())
        .max()
        .unwrap_or(0);
    let end_sample = end_secs
        .map(|end| timeline_sample_index(end.max(start_secs), sample_rate))
        .unwrap_or(longest)
        .min(longest);

    if start_sample >= end_sample {
        return Err("Mixdown range is outside the rendered arrangement".to_string());
    }

    let mut samples = vec![0.0f32; end_sample - start_sample];
    for track in rendered_tracks {
        if track.sample_rate != sample_rate {
            return Err(format!(
                "Rendered track sample-rate mismatch: expected {sample_rate}, got {} for {}",
                track.sample_rate, track.name
            ));
        }
        let track_end = end_sample.min(track.samples.len());
        if start_sample >= track_end {
            continue;
        }
        for (target, sample) in samples
            .iter_mut()
            .zip(track.samples[start_sample..track_end].iter())
        {
            *target += *sample;
        }
    }

    for sample in &mut samples {
        *sample = clip_sample(*sample * master_gain);
    }

    Ok(ArrangementMixdownBuffer {
        samples,
        sample_rate,
        channels: 1,
        timeline_start_secs: start_secs,
    })
}
