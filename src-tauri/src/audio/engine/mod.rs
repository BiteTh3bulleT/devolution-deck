//! Realtime arrangement engine primitives.

pub mod mixer;
pub mod render_shared;

use super::render::{render_project_tracks, RenderedTrack};
use crate::models::Project;

pub use render_shared::ArrangementMixdownBuffer as ArrangementPlaybackBuffer;

pub fn mix_rendered_tracks_for_playback(
    rendered_tracks: &[RenderedTrack],
    sample_rate: u32,
    start_secs: f64,
) -> Result<ArrangementPlaybackBuffer, String> {
    let start_secs = start_secs.max(0.0);
    let mixdown =
        render_shared::mix_rendered_tracks(rendered_tracks, sample_rate, start_secs, None)?;

    if mixdown
        .samples
        .iter()
        .all(|sample| sample.abs() <= f32::EPSILON)
    {
        return Err("Arrangement has no audible material from the requested position".to_string());
    }

    Ok(mixdown)
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

    #[test]
    fn shared_mixdown_uses_same_sum_for_full_export_and_live_slice() {
        let tracks = vec![
            RenderedTrack {
                track_id: "track-a".to_string(),
                name: "Track A".to_string(),
                samples: vec![0.2, 0.2, 0.2, 0.2],
                sample_rate: 4,
            },
            RenderedTrack {
                track_id: "track-b".to_string(),
                name: "Track B".to_string(),
                samples: vec![0.0, 0.3, 0.3, 0.3],
                sample_rate: 4,
            },
        ];

        let full =
            super::render_shared::mix_rendered_tracks(&tracks, 4, 0.0, None).expect("full mixdown");
        let live =
            super::render_shared::mix_rendered_tracks(&tracks, 4, 0.25, None).expect("live slice");

        assert_eq!(full.samples, vec![0.2, 0.5, 0.5, 0.5]);
        assert_eq!(live.samples, full.samples[1..].to_vec());
    }
}
