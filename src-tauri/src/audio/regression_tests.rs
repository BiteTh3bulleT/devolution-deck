use super::{editing, render};
use crate::models::{Project, Track};
use serde_json::json;
fn fixture() -> (tempfile::TempDir, Project) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("source.wav");
    render::write_wav_mono(&path, 8000, &vec![0.2; 8000]).unwrap();
    let mut p = Project::default();
    p.sample_rate = 8000;
    p.media.push(crate::models::MediaAsset {
        id: "m".into(),
        name: "source".into(),
        path: path.to_string_lossy().into(),
        duration_secs: 1.0,
        sample_rate: 8000,
        channels: 1,
    });
    let track:Track=serde_json::from_value(json!({"id":"t","name":"track","index":0,"volume_db":0,"pan":0,"muted":false,"solo":false,"clips":[{"id":"c","media_asset_id":"m","start_secs":0,"source_offset_secs":0,"duration_secs":1}]})).unwrap();
    p.tracks.push(track);
    (dir, p)
}
#[test]
fn muted_stem_option_preserves_signal() {
    let (_dir, mut p) = fixture();
    p.tracks[0].muted = true;
    let included = render::render_project_tracks(&p, true).unwrap();
    let omitted = render::render_project_tracks(&p, false).unwrap();
    assert!((included[0].samples[0] - 0.2).abs() < 1e-6);
    assert!(omitted[0].samples.iter().all(|s| *s == 0.0));
}
#[test]
fn frozen_audio_uses_live_gain_and_pan() {
    let (_dir, mut p) = fixture();
    p.tracks[0].freeze_state.is_frozen = true;
    p.tracks[0].freeze_state.frozen_path = Some(p.media[0].path.clone());
    p.tracks[0].volume_db = -6.0;
    p.tracks[0].pan = 1.0;
    let rendered = render::render_project_tracks(&p, false).unwrap();
    assert_eq!(rendered[0].samples[0], 0.0);
    assert!((rendered[0].samples[1] - 0.2 * 10f32.powf(-6.0 / 20.0)).abs() < 1e-6);
}
#[test]
fn freeze_bounce_is_before_fader() {
    let (_dir, mut p) = fixture();
    p.tracks[0].volume_db = -12.0;
    let frozen = render::render_project_track_pre_mixer(&p, "t", false).unwrap();
    assert!((frozen.samples[0] - 0.2).abs() < 1e-6);
}
#[test]
fn group_mute_and_send_sum_affect_audio() {
    let (_dir, mut p) = fixture();
    p.routing=serde_json::from_value(json!({"buses":[{"id":"bus","name":"bus","member_track_ids":["t"],"gain_db":0,"muted":true,"solo":false}],"returns":[{"id":"return","name":"return","index":0,"gain_db":0,"muted":false}],"sends":[{"id":"send","from_track_id":"t","to_return_id":"return","amount":0.5,"pre_fader":false,"enabled":true}]})).unwrap();
    p.tracks[0].group_track_id = Some("bus".into());
    let rendered = render::render_project_tracks(&p, false).unwrap();
    assert_eq!(rendered[0].samples[0], 0.0);
    assert!((rendered[1].samples[0] - 0.1).abs() < 1e-6);
}
#[test]
fn render_range_cut_keeps_outside_audio_without_overlap() {
    let (_dir, mut p) = fixture();
    editing::remove_range(&mut p.tracks[0], 0.25, 0.75, p.bpm);
    assert_eq!(p.tracks[0].clips.len(), 2);
    assert_eq!(p.tracks[0].clips[0].duration_secs, 0.25);
    assert_eq!(p.tracks[0].clips[1].start_secs, 0.75);
    assert_eq!(p.tracks[0].clips[1].source_offset_secs, 0.75);
}
#[test]
fn short_waveform_is_not_blank() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("short.wav");
    render::write_wav_mono(&path, 8000, &vec![0.5; 100]).unwrap();
    let wave = super::compute_waveform_peaks(&path, 200).unwrap();
    assert!(wave.buckets.iter().all(|b| b.max == 0.5 && b.min == 0.5));
}
#[test]
fn float_wav_preserves_headroom() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("float.wav");
    render::write_wav(&path, 48000, 2, &[1.5, -1.5]).unwrap();
    let samples: Vec<_> = hound::WavReader::open(path)
        .unwrap()
        .into_samples::<f32>()
        .map(Result::unwrap)
        .collect();
    assert_eq!(samples, vec![1.5, -1.5]);
}

#[test]
fn pre_fader_send_ignores_pan_and_gain() {
    let (_dir, mut p) = fixture();
    p.tracks[0].volume_db = -40.0;
    p.tracks[0].pan = 1.0;
    p.routing.returns = serde_json::from_value(
        json!([{"id":"r","name":"Return","index":0,"gain_db":0,"muted":false}]),
    )
    .unwrap();
    p.routing.sends=serde_json::from_value(json!([{"id":"s","from_track_id":"t","to_return_id":"r","amount":1.0,"pre_fader":true,"enabled":true}])).unwrap();
    let rendered = render::render_project_tracks(&p, false).unwrap();
    let ret = rendered.iter().find(|t| t.track_id == "r").unwrap();
    assert!((ret.samples[0] - 0.2).abs() < 1e-6);
    assert!((ret.samples[1] - 0.2).abs() < 1e-6);
}
#[test]
fn comp_selection_replaces_only_its_interval() {
    let (_dir, mut p) = fixture();
    p.tracks[0].take_lanes=serde_json::from_value(json!([{"id":"lane","name":"take","muted":false,"clips":[{"id":"take","media_asset_id":"m","start_secs":0,"source_offset_secs":0,"duration_secs":1}]}])).unwrap();
    p.tracks[0].comp_regions=serde_json::from_value(json!([{"id":"comp","lane_id":"lane","take_clip_id":"take","start_secs":0.25,"end_secs":0.75,"fade_secs":0}])).unwrap();
    let rendered = render::render_project_tracks(&p, false).unwrap();
    for sample in &rendered[0].samples[..16000] {
        assert!((*sample - 0.2).abs() < 1e-6);
    }
}

#[test]
fn track_render_keeps_float_headroom_for_later_master_attenuation() {
    let (_dir, mut project) = fixture();
    project.tracks[0].volume_db = 20.0;
    let rendered = render::render_project_tracks(&project, false).unwrap();
    assert!((rendered[0].samples[0] - 2.0).abs() < 1e-5);
}
