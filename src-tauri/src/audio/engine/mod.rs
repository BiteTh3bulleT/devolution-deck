//! Realtime arrangement engine primitives.

pub mod automation;
pub mod meters;
pub mod midi_synth;
pub mod mixer;
pub mod render_shared;

use super::render::{render_project_tracks, write_wav, RenderedTrack};
use crate::models::Project;
use std::path::Path;

pub use render_shared::ArrangementMixdownBuffer as ArrangementPlaybackBuffer;

#[derive(Debug, Clone, PartialEq)]
pub struct MixdownExportResult {
    pub sample_rate: u32,
    pub channels: u16,
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
    master_gain_db: f64,
) -> Result<ArrangementPlaybackBuffer, String> {
    let start_secs = start_secs.max(0.0);
    let mixdown = render_shared::mix_rendered_tracks(
        rendered_tracks,
        sample_rate,
        start_secs,
        end_secs,
        master_gain_db,
    )?;

    if mixdown
        .samples
        .iter()
        .all(|sample| sample.abs() <= f32::EPSILON)
    {
        return Err("Arrangement has no audible material from the requested position".to_string());
    }

    Ok(mixdown)
}

/// Master playback buffer plus the per-track buffers it was mixed from,
/// kept so meters can read the actual rendered signal at the engine clock.
pub struct ArrangementPlayback {
    pub buffer: ArrangementPlaybackBuffer,
    pub rendered_tracks: Vec<RenderedTrack>,
}

pub fn prepare_project_playback(
    project: &Project,
    start_secs: f64,
) -> Result<ArrangementPlayback, String> {
    let rendered_tracks = render_project_tracks(project, false)?;
    let buffer = mix_rendered_tracks_audible(
        &rendered_tracks,
        project.sample_rate.max(8000),
        start_secs,
        None,
        project.master_gain_db,
    )?;
    Ok(ArrangementPlayback {
        buffer,
        rendered_tracks,
    })
}

pub fn render_project_for_realtime_playback(
    project: &Project,
    start_secs: f64,
) -> Result<ArrangementPlaybackBuffer, String> {
    Ok(prepare_project_playback(project, start_secs)?.buffer)
}

pub fn render_project_for_export(
    project: &Project,
    start_secs: f64,
    end_secs: Option<f64>,
) -> Result<ArrangementPlaybackBuffer, String> {
    let rendered_tracks = render_project_tracks(project, false)?;
    mix_rendered_tracks_audible(
        &rendered_tracks,
        project.sample_rate.max(8000),
        start_secs,
        end_secs,
        project.master_gain_db,
    )
}

pub fn export_project_mixdown_to_wav(
    project: &Project,
    output_path: &Path,
    start_secs: f64,
    end_secs: Option<f64>,
) -> Result<MixdownExportResult, String> {
    let buffer = render_project_for_export(project, start_secs, end_secs)?;
    write_wav(
        output_path,
        buffer.sample_rate,
        buffer.channels,
        &buffer.samples,
    )?;
    let frames = buffer.samples.len() / buffer.channels.max(1) as usize;
    Ok(MixdownExportResult {
        sample_rate: buffer.sample_rate,
        channels: buffer.channels,
        samples_written: buffer.samples.len(),
        duration_secs: frames as f64 / buffer.sample_rate.max(1) as f64,
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

    fn write_temp_wav_stereo(left: f32, right: f32, frames: usize, sample_rate: u32) -> String {
        let path = std::env::temp_dir().join(format!(
            "devodeck_stereo_test_{}_{}_{}.wav",
            std::process::id(),
            (left * 1000.0) as i32,
            (right * 1000.0) as i32
        ));
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate,
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        };
        let mut writer = hound::WavWriter::create(&path, spec).expect("writer");
        for _ in 0..frames {
            writer.write_sample(left).expect("L");
            writer.write_sample(right).expect("R");
        }
        writer.finalize().expect("finalize");
        path.to_string_lossy().to_string()
    }

    fn write_temp_wav_mono(value: f32, frames: usize, sample_rate: u32) -> String {
        let path = std::env::temp_dir().join(format!(
            "devodeck_mono_test_{}_{}.wav",
            std::process::id(),
            (value * 1000.0) as i32
        ));
        crate::audio::render::write_wav_mono(&path, sample_rate, &vec![value; frames])
            .expect("mono wav");
        path.to_string_lossy().to_string()
    }

    fn clip_project(asset_path: &str, duration_secs: f64, pan: f64) -> Project {
        let mut project = Project::default();
        project.sample_rate = 8000;
        project.media.push(crate::models::MediaAsset {
            id: "asset".to_string(),
            name: "Asset".to_string(),
            path: asset_path.to_string(),
            duration_secs,
            sample_rate: 8000,
            channels: 2,
        });
        let mut track = {
            let mut base = midi_test_project();
            base.tracks.remove(0)
        };
        track.track_type = TrackType::Audio;
        track.midi_clips.clear();
        track.pan = pan;
        track.clips.push(crate::models::TimelineClip {
            id: "clip".to_string(),
            media_asset_id: "asset".to_string(),
            start_secs: 0.0,
            source_offset_secs: 0.0,
            duration_secs,
            warp: None,
            slice_markers: vec![],
        });
        project.tracks.push(track);
        project
    }

    #[test]
    fn volume_automation_shapes_live_and_export_identically() {
        let wav = write_temp_wav_mono(0.5, 8000, 8000);
        let mut project = clip_project(&wav, 1.0, 0.0);
        let track_id = project.tracks[0].id.clone();
        project
            .automation_lanes
            .push(crate::models::AutomationLane {
                id: "vol-lane".to_string(),
                track_id,
                parameter: "volume_db".to_string(),
                enabled: true,
                points: vec![
                    crate::models::AutomationPoint {
                        id: "a".to_string(),
                        time_secs: 0.0,
                        value: 0.0,
                        curve: 0.0,
                    },
                    crate::models::AutomationPoint {
                        id: "b".to_string(),
                        time_secs: 1.0,
                        value: -60.0,
                        curve: 0.0,
                    },
                ],
            });

        let live = super::render_project_for_realtime_playback(&project, 0.0).expect("live");
        let export = super::render_project_for_export(&project, 0.0, None).expect("export");

        assert_eq!(live.samples, export.samples);
        // Fade: early frames near full level, late frames much quieter.
        let early = live.samples[100 * 2].abs();
        let late = live.samples[7900 * 2].abs();
        assert!((early - 0.5).abs() < 0.05, "early was {early}");
        assert!(late < 0.05, "late was {late}");
        assert!(early > late * 5.0, "no fade: early {early} late {late}");

        // Disabling the lane removes the fade.
        project.automation_lanes[0].enabled = false;
        let flat = super::render_project_for_realtime_playback(&project, 0.0).expect("flat");
        let flat_late = flat.samples[7900 * 2].abs();
        assert!((flat_late - 0.5).abs() < 0.05, "flat late was {flat_late}");

        let _ = std::fs::remove_file(&wav);
    }

    #[test]
    fn stereo_clip_preserves_left_right_in_live_and_export() {
        let wav = write_temp_wav_stereo(0.8, -0.2, 4000, 8000);
        let project = clip_project(&wav, 0.5, 0.0);

        let live =
            super::render_project_for_realtime_playback(&project, 0.0).expect("live buffer");
        let export = super::render_project_for_export(&project, 0.0, None).expect("export");
        let _ = std::fs::remove_file(&wav);

        assert_eq!(live.channels, 2);
        assert_eq!(export.channels, 2);
        assert_eq!(live.samples, export.samples);
        // Probe a frame solidly inside the clip body.
        let frame = 1000usize;
        let left = live.samples[frame * 2];
        let right = live.samples[frame * 2 + 1];
        assert!((left - 0.8).abs() < 1e-3, "left was {left}");
        assert!((right + 0.2).abs() < 1e-3, "right was {right}");
    }

    #[test]
    fn mono_clip_renders_identically_to_both_channels() {
        let wav = write_temp_wav_mono(0.4, 4000, 8000);
        let project = clip_project(&wav, 0.5, 0.0);

        let live = super::render_project_for_realtime_playback(&project, 0.0).expect("live");
        let _ = std::fs::remove_file(&wav);

        assert_eq!(live.channels, 2);
        let frame = 1000usize;
        let left = live.samples[frame * 2];
        let right = live.samples[frame * 2 + 1];
        assert!((left - right).abs() < 1e-6, "L {left} != R {right}");
        assert!((left - 0.4).abs() < 1e-3, "left was {left}");
    }

    #[test]
    fn pan_acts_as_balance_between_channels() {
        let wav = write_temp_wav_stereo(0.5, 0.5, 4000, 8000);

        let hard_right = clip_project(&wav, 0.5, 1.0);
        let buffer = super::render_project_for_realtime_playback(&hard_right, 0.0).expect("right");
        let frame = 1000usize;
        assert!(buffer.samples[frame * 2].abs() < 1e-6, "left must be silent");
        assert!((buffer.samples[frame * 2 + 1] - 0.5).abs() < 1e-3);

        let hard_left = clip_project(&wav, 0.5, -1.0);
        let buffer = super::render_project_for_realtime_playback(&hard_left, 0.0).expect("left");
        assert!((buffer.samples[frame * 2] - 0.5).abs() < 1e-3);
        assert!(buffer.samples[frame * 2 + 1].abs() < 1e-6, "right must be silent");

        let _ = std::fs::remove_file(&wav);
    }

    #[test]
    fn master_gain_scales_live_and_export_identically() {
        let mut unity_project = midi_test_project();
        unity_project.master_gain_db = 0.0;
        let mut halved_project = midi_test_project();
        halved_project.master_gain_db = -6.020599913279624;

        let unity =
            super::render_project_for_realtime_playback(&unity_project, 0.0).expect("unity");
        let live =
            super::render_project_for_realtime_playback(&halved_project, 0.0).expect("live");
        let export =
            super::render_project_for_export(&halved_project, 0.0, None).expect("export");

        assert_eq!(live.samples, export.samples);
        assert_eq!(live.samples.len(), unity.samples.len());
        for (halved, full) in live.samples.iter().zip(unity.samples.iter()) {
            assert!(
                (halved - full * 0.5).abs() < 1e-4,
                "expected {halved} to be half of {full}"
            );
        }
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
            channels: 1,
        }];

        let export =
            super::mix_rendered_tracks_audible(&tracks, 4, 0.25, Some(0.75), 0.0).expect("range");

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
            channels: 1,
        }];

        let err = super::mix_rendered_tracks_audible(&tracks, 4, 0.0, None, 0.0)
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

        assert_eq!(spec.channels, live.channels);
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
            channels: 1,
            },
            RenderedTrack {
                track_id: "track-b".to_string(),
                name: "Track B".to_string(),
                samples: vec![0.0, 0.5, 0.5, 0.5],
                sample_rate: 2,
            channels: 1,
            },
        ];

        let playback =
            super::mix_rendered_tracks_audible(&tracks, 2, 0.5, None, 0.0).expect("mixed buffer");

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
            channels: 1,
            },
            RenderedTrack {
                track_id: "track-b".to_string(),
                name: "Track B".to_string(),
                samples: vec![0.0, 0.3, 0.3, 0.3],
                sample_rate: 4,
            channels: 1,
            },
        ];

        let full = super::render_shared::mix_rendered_tracks(&tracks, 4, 0.0, None, 0.0)
            .expect("full mixdown");
        let live = super::render_shared::mix_rendered_tracks(&tracks, 4, 0.25, None, 0.0)
            .expect("live slice");

        assert_eq!(full.samples, vec![0.2, 0.5, 0.5, 0.5]);
        assert_eq!(live.samples, full.samples[1..].to_vec());
    }
}
