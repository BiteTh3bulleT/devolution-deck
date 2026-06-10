//! Realtime arrangement engine primitives.

pub mod mixer;
pub mod render_shared;

use super::render::{render_project_tracks, write_wav_mono, RenderedTrack};
use crate::models::Project;
use std::path::Path;

pub use render_shared::ArrangementMixdownBuffer as ArrangementPlaybackBuffer;

#[derive(Debug, Clone, PartialEq)]
pub struct MixdownExportResult {
    pub sample_rate: u32,
    pub samples_written: usize,
    pub duration_secs: f64,
}

/// Shared live/export arrangement mix: range-aware sum with an explicit error
/// when the requested range carries no audible material.
fn mix_rendered_tracks_audible(
    rendered_tracks: &[RenderedTrack],
    sample_rate: u32,
    start_secs: f64,
    end_secs: Option<f64>,
) -> Result<ArrangementPlaybackBuffer, String> {
    let start_secs = start_secs.max(0.0);
    let mixdown =
        render_shared::mix_rendered_tracks(rendered_tracks, sample_rate, start_secs, end_secs)?;

    if mixdown
        .samples
        .iter()
        .all(|sample| sample.abs() <= f32::EPSILON)
    {
        return Err("Arrangement has no audible material from the requested position".to_string());
    }

    Ok(mixdown)
}

pub fn mix_rendered_tracks_for_playback(
    rendered_tracks: &[RenderedTrack],
    sample_rate: u32,
    start_secs: f64,
) -> Result<ArrangementPlaybackBuffer, String> {
    mix_rendered_tracks_audible(rendered_tracks, sample_rate, start_secs, None)
}

pub fn mix_rendered_tracks_for_export(
    rendered_tracks: &[RenderedTrack],
    sample_rate: u32,
    start_secs: f64,
    end_secs: Option<f64>,
) -> Result<ArrangementPlaybackBuffer, String> {
    mix_rendered_tracks_audible(rendered_tracks, sample_rate, start_secs, end_secs)
}

pub fn render_project_for_realtime_playback(
    project: &Project,
    start_secs: f64,
) -> Result<ArrangementPlaybackBuffer, String> {
    let rendered_tracks = render_project_tracks(project, false)?;
    mix_rendered_tracks_for_playback(&rendered_tracks, project.sample_rate.max(8000), start_secs)
}

pub fn render_project_for_export(
    project: &Project,
    start_secs: f64,
    end_secs: Option<f64>,
) -> Result<ArrangementPlaybackBuffer, String> {
    let rendered_tracks = render_project_tracks(project, false)?;
    mix_rendered_tracks_for_export(
        &rendered_tracks,
        project.sample_rate.max(8000),
        start_secs,
        end_secs,
    )
}

pub fn export_project_mixdown_to_wav(
    project: &Project,
    output_path: &Path,
    start_secs: f64,
    end_secs: Option<f64>,
) -> Result<MixdownExportResult, String> {
    let buffer = render_project_for_export(project, start_secs, end_secs)?;
    write_wav_mono(output_path, buffer.sample_rate, &buffer.samples)?;
    Ok(MixdownExportResult {
        sample_rate: buffer.sample_rate,
        samples_written: buffer.samples.len(),
        duration_secs: buffer.samples.len() as f64 / buffer.sample_rate.max(1) as f64,
    })
}

#[cfg(test)]
mod tests {
    use crate::audio::render::RenderedTrack;
    use crate::models::midi::MidiNote;
    use crate::models::{MidiClip, Project, Track, TrackType};

    fn midi_test_project() -> Project {
        let mut project = Project::default();
        project.tracks.push(Track {
            id: "midi-track".to_string(),
            name: "MIDI 1".to_string(),
            index: 0,
            track_type: TrackType::Midi,
            clips: vec![],
            midi_clips: vec![MidiClip {
                id: "midi-clip".to_string(),
                start_secs: 0.0,
                duration_secs: 1.0,
                notes: vec![MidiNote {
                    id: "note".to_string(),
                    pitch: 69,
                    start_ticks: 0,
                    duration_ticks: crate::models::TICKS_PER_BEAT,
                    velocity: 100,
                }],
                loop_clip: false,
            }],
            instrument: None,
            volume_db: 0.0,
            pan: 0.0,
            muted: false,
            solo: false,
            group_track_id: None,
            plugin_chain: Default::default(),
            freeze_state: Default::default(),
            take_lanes: vec![],
            comp_regions: vec![],
            armed: false,
        });
        project
    }

    #[test]
    fn export_mixdown_matches_live_playback_for_same_project() {
        let project = midi_test_project();

        let live =
            super::render_project_for_realtime_playback(&project, 0.0).expect("live buffer");
        let export = super::render_project_for_export(&project, 0.0, None).expect("export buffer");

        assert_eq!(export.sample_rate, live.sample_rate);
        assert_eq!(export.channels, live.channels);
        assert_eq!(export.samples, live.samples);
    }

    #[test]
    fn export_mixdown_honors_explicit_end_range() {
        let tracks = vec![RenderedTrack {
            track_id: "track-a".to_string(),
            name: "Track A".to_string(),
            samples: vec![0.1, 0.2, 0.3, 0.4],
            sample_rate: 4,
        }];

        let export =
            super::mix_rendered_tracks_for_export(&tracks, 4, 0.25, Some(0.75)).expect("range");

        assert_eq!(export.timeline_start_secs, 0.25);
        assert_eq!(export.samples, vec![0.2, 0.3]);
    }

    #[test]
    fn export_mixdown_rejects_silent_range() {
        let tracks = vec![RenderedTrack {
            track_id: "track-a".to_string(),
            name: "Track A".to_string(),
            samples: vec![0.0, 0.0, 0.0, 0.0],
            sample_rate: 4,
        }];

        let err = super::mix_rendered_tracks_for_export(&tracks, 4, 0.0, None)
            .expect_err("silent export must fail");

        assert!(err.contains("no audible"), "unexpected error: {err}");
    }

    #[test]
    fn export_project_mixdown_writes_wav_matching_live_buffer() {
        let project = midi_test_project();
        let output_path = std::env::temp_dir().join(format!(
            "devodeck_mixdown_parity_test_{}.wav",
            std::process::id()
        ));

        let live =
            super::render_project_for_realtime_playback(&project, 0.0).expect("live buffer");
        let result = super::export_project_mixdown_to_wav(&project, &output_path, 0.0, None)
            .expect("export result");

        let reader = hound::WavReader::open(&output_path).expect("wav readable");
        let spec = reader.spec();
        let written: Vec<f32> = reader
            .into_samples::<f32>()
            .map(|sample| sample.expect("sample"))
            .collect();
        let _ = std::fs::remove_file(&output_path);

        assert_eq!(spec.channels, 1);
        assert_eq!(spec.sample_rate, live.sample_rate);
        assert_eq!(result.sample_rate, live.sample_rate);
        assert_eq!(result.samples_written, live.samples.len());
        assert_eq!(written.len(), live.samples.len());
        assert_eq!(written, live.samples);
    }

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
