//! Shared live/export arrangement mixdown helpers.

use super::super::render::RenderedTrack;

#[derive(Debug, Clone, PartialEq)]
pub struct ArrangementMixdownBuffer {
    /// Interleaved samples (`channels` per frame).
    pub samples: Vec<f32>,
    pub sample_rate: u32,
    pub channels: u16,
    pub timeline_start_secs: f64,
}

fn clip_sample(value: f32) -> f32 {
    value.clamp(-1.0, 1.0)
}

fn db_to_gain(db: f64) -> f32 {
    (10f64.powf(db / 20.0)) as f32
}

fn timeline_frame_index(seconds: f64, sample_rate: u32) -> usize {
    (seconds.max(0.0) * sample_rate.max(1) as f64).round() as usize
}

pub fn mix_rendered_tracks(
    rendered_tracks: &[RenderedTrack],
    sample_rate: u32,
    start_secs: f64,
    end_secs: Option<f64>,
    master_gain_db: f64,
) -> Result<ArrangementMixdownBuffer, String> {
    if rendered_tracks.is_empty() {
        return Err("No rendered tracks available for mixdown".to_string());
    }

    let channels = rendered_tracks[0].channels.max(1) as usize;
    let master_gain = db_to_gain(master_gain_db);
    let sample_rate = sample_rate.max(1);
    let start_secs = start_secs.max(0.0);
    let start_frame = timeline_frame_index(start_secs, sample_rate);
    let longest_frames = rendered_tracks
        .iter()
        .map(|track| track.samples.len() / channels)
        .max()
        .unwrap_or(0);
    let end_frame = end_secs
        .map(|end| timeline_frame_index(end.max(start_secs), sample_rate))
        .unwrap_or(longest_frames)
        .min(longest_frames);

    if start_frame >= end_frame {
        return Err("Mixdown range is outside the rendered arrangement".to_string());
    }

    let mut samples = vec![0.0f32; (end_frame - start_frame) * channels];
    for track in rendered_tracks {
        if track.sample_rate != sample_rate {
            return Err(format!(
                "Rendered track sample-rate mismatch: expected {sample_rate}, got {} for {}",
                track.sample_rate, track.name
            ));
        }
        if track.channels.max(1) as usize != channels {
            return Err(format!(
                "Rendered track channel mismatch: expected {channels}, got {} for {}",
                track.channels, track.name
            ));
        }
        let track_end = (end_frame * channels).min(track.samples.len());
        let track_start = start_frame * channels;
        if track_start >= track_end {
            continue;
        }
        for (target, sample) in samples
            .iter_mut()
            .zip(track.samples[track_start..track_end].iter())
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
        channels: channels as u16,
        timeline_start_secs: start_secs,
    })
}
