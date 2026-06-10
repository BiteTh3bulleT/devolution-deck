//! Realtime arrangement engine primitives.

use super::render::{render_project_tracks, RenderedTrack};
use crate::models::Project;

#[derive(Debug, Clone)]
pub struct ArrangementPlaybackBuffer {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
    pub channels: u16,
    pub timeline_start_secs: f64,
}

fn clip_sample(value: f32) -> f32 {
    value.clamp(-1.0, 1.0)
}

pub fn mix_rendered_tracks_for_playback(
    rendered_tracks: &[RenderedTrack],
    sample_rate: u32,
    start_secs: f64,
) -> Result<ArrangementPlaybackBuffer, String> {
    let sample_rate = sample_rate.max(1);
    let start_secs = start_secs.max(0.0);
    let start_sample = (start_secs * sample_rate as f64).round() as usize;
    let longest = rendered_tracks
        .iter()
        .map(|track| track.samples.len())
        .max()
        .unwrap_or(0);
    if start_sample >= longest {
        return Err("Playback start is beyond the end of the arrangement".to_string());
    }

    let mut samples = vec![0.0f32; longest - start_sample];
    for track in rendered_tracks {
        if track.sample_rate != sample_rate {
            return Err(format!(
                "Rendered track sample-rate mismatch: expected {sample_rate}, got {} for {}",
                track.sample_rate, track.name
            ));
        }
        for (target, sample) in samples
            .iter_mut()
            .zip(track.samples.iter().skip(start_sample))
        {
            *target += *sample;
        }
    }
    for sample in &mut samples {
        *sample = clip_sample(*sample);
    }

    if samples.iter().all(|sample| sample.abs() <= f32::EPSILON) {
        return Err("Arrangement has no audible material from the requested position".to_string());
    }

    Ok(ArrangementPlaybackBuffer {
        samples,
        sample_rate,
        channels: 1,
        timeline_start_secs: start_secs,
    })
}

pub fn render_project_for_realtime_playback(
    project: &Project,
    start_secs: f64,
) -> Result<ArrangementPlaybackBuffer, String> {
    let rendered_tracks = render_project_tracks(project, false)?;
    mix_rendered_tracks_for_playback(&rendered_tracks, project.sample_rate.max(8000), start_secs)
}

#[cfg(test)]
mod tests {
    use crate::audio::render::RenderedTrack;

    #[test]
    fn mixes_all_rendered_tracks_from_requested_timeline_start() {
        let tracks = vec![
            RenderedTrack {
                track_id: "track-a".to_string(),
                name: "Track A".to_string(),
                samples: vec![0.25, 0.25, 0.25, 0.25],
                sample_rate: 2,
            },
            RenderedTrack {
                track_id: "track-b".to_string(),
                name: "Track B".to_string(),
                samples: vec![0.0, 0.5, 0.5, 0.5],
                sample_rate: 2,
            },
        ];

        let playback =
            super::mix_rendered_tracks_for_playback(&tracks, 2, 0.5).expect("mixed buffer");

        assert_eq!(playback.sample_rate, 2);
        assert_eq!(playback.channels, 1);
        assert_eq!(playback.timeline_start_secs, 0.5);
        assert_eq!(playback.samples, vec![0.75, 0.75, 0.75]);
    }
}
