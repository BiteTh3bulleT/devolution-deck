//! Offline rendering utilities used by freeze/render-in-place/stem export.
//! The arrangement path renders interleaved stereo; mono sources are
//! duplicated to both channels so mono compatibility is preserved.

use super::engine::automation::LaneSampler;
use super::engine::mixer::track_should_render;
use super::vst_host::{apply_plugin_chain, apply_plugin_chain_stereo};
use crate::models::{CompRegion, Project, TakeClip, Track};
use hound::{SampleFormat, WavSpec, WavWriter};
use std::collections::HashMap;
use std::fs::File;
use std::path::Path;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

#[derive(Debug, Clone)]
pub struct RenderedTrack {
    pub track_id: String,
    pub name: String,
    /// Interleaved samples (`channels` per frame).
    pub samples: Vec<f32>,
    pub sample_rate: u32,
    pub channels: u16,
}

/// Decoded stereo asset: left and right channel buffers of equal length.
#[derive(Debug, Clone)]
pub(crate) struct StereoSource {
    pub(crate) left: Vec<f32>,
    pub(crate) right: Vec<f32>,
}

type DecodedAssetCache = HashMap<String, StereoSource>;

fn db_to_gain(db: f64) -> f32 {
    (10f64.powf(db / 20.0)) as f32
}

fn clip_sample(v: f32) -> f32 {
    v.clamp(-1.0, 1.0)
}

/// Pan as a balance control: unity at center, attenuates the opposite
/// channel toward the extremes, never boosts.
fn pan_gains(pan: f64) -> (f32, f32) {
    let pan = pan.clamp(-1.0, 1.0) as f32;
    if pan >= 0.0 {
        (1.0 - pan, 1.0)
    } else {
        (1.0, 1.0 + pan)
    }
}

fn same_path(a: &Path, b: &Path) -> bool {
    if a == b {
        return true;
    }
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(ac), Ok(bc)) => ac == bc,
        _ => false,
    }
}

/// Decode an audio file preserving stereo. Mono sources are duplicated to
/// both channels; sources with more than two channels are downmixed to a
/// stereo pair from the first two channels.
pub(crate) fn decode_audio_stereo(path: &Path) -> Result<(u32, StereoSource), String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let probe = symphonia::default::get_probe();
    let mut format_reader = probe
        .format(
            &Hint::new(),
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| e.to_string())?
        .format;

    let track = format_reader
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != symphonia::core::codecs::CODEC_TYPE_NULL)
        .ok_or("No audio track")?;

    let sr = track
        .codec_params
        .sample_rate
        .ok_or("Missing sample rate")?;
    let channels = track
        .codec_params
        .channels
        .ok_or("Missing channel layout")?
        .count()
        .max(1);

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| e.to_string())?;

    let track_id = track.id;
    let mut left = Vec::<f32>::new();
    let mut right = Vec::<f32>::new();

    while let Ok(packet) = format_reader.next_packet() {
        if packet.track_id() != track_id {
            continue;
        }
        let Ok(decoded) = decoder.decode(&packet) else {
            continue;
        };
        let spec = *decoded.spec();
        let duration = decoded.frames();
        let mut buf = SampleBuffer::<f32>::new(duration as u64, spec);
        buf.copy_interleaved_ref(decoded);
        let interleaved = buf.samples();
        for frame in interleaved.chunks(channels) {
            let l = frame[0];
            let r = if channels >= 2 { frame[1] } else { frame[0] };
            left.push(l);
            right.push(r);
        }
    }

    Ok((sr, StereoSource { left, right }))
}

fn decode_audio_mono(path: &Path) -> Result<(u32, Vec<f32>), String> {
    let (sr, stereo) = decode_audio_stereo(path)?;
    let mono = stereo
        .left
        .iter()
        .zip(stereo.right.iter())
        .map(|(l, r)| (l + r) * 0.5)
        .collect();
    Ok((sr, mono))
}

fn resample_linear(input: &[f32], src_sr: u32, dst_sr: u32) -> Vec<f32> {
    if input.is_empty() || src_sr == dst_sr {
        return input.to_vec();
    }
    let ratio = dst_sr as f64 / src_sr as f64;
    let out_len = (input.len() as f64 * ratio).ceil() as usize;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src_pos = i as f64 / ratio;
        let i0 = src_pos.floor() as usize;
        let i1 = (i0 + 1).min(input.len() - 1);
        let frac = (src_pos - i0 as f64) as f32;
        let s = input[i0] * (1.0 - frac) + input[i1] * frac;
        out.push(s);
    }
    out
}

pub(crate) fn resample_stereo(source: &StereoSource, src_sr: u32, dst_sr: u32) -> StereoSource {
    StereoSource {
        left: resample_linear(&source.left, src_sr, dst_sr),
        right: resample_linear(&source.right, src_sr, dst_sr),
    }
}

fn mix_audio_segment(
    dest: &mut [f32],
    clip_start_secs: f64,
    source_offset_secs: f64,
    duration_secs: f64,
    src_samples: &[f32],
    sample_rate: u32,
) {
    if duration_secs <= 0.0 || src_samples.is_empty() {
        return;
    }
    let start_idx = (clip_start_secs * sample_rate as f64).round() as isize;
    let src_start = (source_offset_secs * sample_rate as f64).round().max(0.0) as usize;
    let max_len = (duration_secs * sample_rate as f64).round().max(0.0) as usize;
    let src_end = (src_start + max_len).min(src_samples.len());
    if src_start >= src_end {
        return;
    }
    for (i, sample) in src_samples[src_start..src_end].iter().enumerate() {
        let di = start_idx + i as isize;
        if di < 0 {
            continue;
        }
        let di = di as usize;
        if di >= dest.len() {
            break;
        }
        dest[di] += *sample;
    }
}

fn mix_stereo_segment(
    left: &mut [f32],
    right: &mut [f32],
    clip_start_secs: f64,
    source_offset_secs: f64,
    duration_secs: f64,
    source: &StereoSource,
    sample_rate: u32,
) {
    mix_audio_segment(
        left,
        clip_start_secs,
        source_offset_secs,
        duration_secs,
        &source.left,
        sample_rate,
    );
    mix_audio_segment(
        right,
        clip_start_secs,
        source_offset_secs,
        duration_secs,
        &source.right,
        sample_rate,
    );
}

fn clip_duration_secs(project: &Project) -> f64 {
    let mut end = 30.0f64;
    for track in &project.tracks {
        for clip in &track.clips {
            end = end.max(clip.start_secs + clip.duration_secs);
        }
        for clip in &track.midi_clips {
            end = end.max(clip.start_secs + clip.duration_secs);
        }
        for lane in &track.take_lanes {
            for clip in &lane.clips {
                end = end.max(clip.start_secs + clip.duration_secs);
            }
        }
        for comp in &track.comp_regions {
            end = end.max(comp.end_secs);
        }
    }
    end.max(1.0)
}

fn find_take_clip<'a>(track: &'a Track, region: &CompRegion) -> Option<&'a TakeClip> {
    let lane = track.take_lanes.iter().find(|l| l.id == region.lane_id)?;
    lane.clips.iter().find(|c| c.id == region.take_clip_id)
}

fn decode_asset_cached(
    project: &Project,
    media_asset_id: &str,
    sample_rate: u32,
    cache: &mut DecodedAssetCache,
) -> Option<StereoSource> {
    if let Some(cached) = cache.get(media_asset_id) {
        return Some(cached.clone());
    }
    let asset = project.media.iter().find(|m| m.id == media_asset_id)?;
    let (src_sr, raw) = decode_audio_stereo(Path::new(&asset.path)).ok()?;
    let source = resample_stereo(&raw, src_sr, sample_rate);
    cache.insert(media_asset_id.to_string(), source.clone());
    Some(source)
}

fn render_comp_regions_with_cache(
    project: &Project,
    track: &Track,
    left: &mut [f32],
    right: &mut [f32],
    sample_rate: u32,
    cache: &mut DecodedAssetCache,
) {
    for region in &track.comp_regions {
        let Some(clip) = find_take_clip(track, region) else {
            continue;
        };
        let Some(source) = decode_asset_cached(project, &clip.media_asset_id, sample_rate, cache)
        else {
            continue;
        };
        let source_offset =
            clip.source_offset_secs + (region.start_secs - clip.start_secs).max(0.0);
        let dur = (region.end_secs - region.start_secs).max(0.0);
        mix_stereo_segment(
            left,
            right,
            region.start_secs,
            source_offset,
            dur,
            &source,
            sample_rate,
        );
    }
}

fn interleave(left: &[f32], right: &[f32]) -> Vec<f32> {
    let mut out = Vec::with_capacity(left.len() * 2);
    for (l, r) in left.iter().zip(right.iter()) {
        out.push(*l);
        out.push(*r);
    }
    out
}

/// Render a track into interleaved stereo at the project sample rate.
fn render_arrangement_track(
    project: &Project,
    track: &Track,
    sample_rate: u32,
    total_frames: usize,
    cache: &mut DecodedAssetCache,
) -> Vec<f32> {
    let mut left = vec![0.0f32; total_frames];
    let mut right = vec![0.0f32; total_frames];

    if track.freeze_state.is_frozen {
        if let Some(path) = &track.freeze_state.frozen_path {
            if let Ok((src_sr, raw)) = decode_audio_stereo(Path::new(path)) {
                let source = resample_stereo(&raw, src_sr, sample_rate);
                let duration = source.left.len() as f64 / sample_rate as f64;
                mix_stereo_segment(
                    &mut left,
                    &mut right,
                    0.0,
                    0.0,
                    duration,
                    &source,
                    sample_rate,
                );
                return interleave(&left, &right);
            }
        }
    }

    if !track.comp_regions.is_empty() {
        render_comp_regions_with_cache(project, track, &mut left, &mut right, sample_rate, cache);
    } else {
        for clip in &track.clips {
            let Some(source) =
                decode_asset_cached(project, &clip.media_asset_id, sample_rate, cache)
            else {
                continue;
            };
            mix_stereo_segment(
                &mut left,
                &mut right,
                clip.start_secs,
                clip.source_offset_secs,
                clip.duration_secs,
                &source,
                sample_rate,
            );
        }
    }

    if !track.midi_clips.is_empty() {
        let voice = super::engine::midi_synth::MidiVoice::from_plugin_type(
            track
                .instrument
                .as_ref()
                .map(|instrument| instrument.plugin_type.as_str()),
        );
        let mut midi = vec![0.0f32; total_frames];
        for clip in &track.midi_clips {
            super::engine::midi_synth::synth_midi_clip(
                &mut midi,
                clip,
                voice,
                project.bpm,
                sample_rate,
            );
        }
        for (i, sample) in midi.iter().enumerate() {
            left[i] += *sample;
            right[i] += *sample;
        }
    }

    apply_plugin_chain_stereo(
        &mut left,
        &mut right,
        &track.plugin_chain.instances,
        sample_rate,
        &project.plugin_registry,
    );

    if track.muted {
        left.fill(0.0);
        right.fill(0.0);
    } else {
        let mut volume_sampler = project
            .automation_lanes
            .iter()
            .find(|lane| lane.track_id == track.id && lane.parameter == "volume_db")
            .and_then(LaneSampler::new);
        let mut pan_sampler = project
            .automation_lanes
            .iter()
            .find(|lane| lane.track_id == track.id && lane.parameter == "pan")
            .and_then(LaneSampler::new);

        if volume_sampler.is_none() && pan_sampler.is_none() {
            let g = db_to_gain(track.volume_db);
            let (pan_l, pan_r) = pan_gains(track.pan);
            for sample in left.iter_mut() {
                *sample = clip_sample(*sample * g * pan_l);
            }
            for sample in right.iter_mut() {
                *sample = clip_sample(*sample * g * pan_r);
            }
        } else {
            for frame in 0..total_frames {
                let t = frame as f64 / sample_rate as f64;
                let volume_db = volume_sampler
                    .as_mut()
                    .map(|sampler| sampler.value_at(t))
                    .unwrap_or(track.volume_db);
                let pan = pan_sampler
                    .as_mut()
                    .map(|sampler| sampler.value_at(t))
                    .unwrap_or(track.pan);
                let g = db_to_gain(volume_db);
                let (pan_l, pan_r) = pan_gains(pan);
                left[frame] = clip_sample(left[frame] * g * pan_l);
                right[frame] = clip_sample(right[frame] * g * pan_r);
            }
        }
    }

    interleave(&left, &right)
}

/// Sidechain ducking over interleaved stereo buffers. The envelope follows
/// the mean absolute value of each source frame; the gain applies to every
/// channel of the target frame so the stereo image is preserved.
fn apply_sidechain_ducking(
    source: &[f32],
    target: &mut [f32],
    channels: usize,
    amount: f64,
    sample_rate: u32,
) {
    let duck = amount.clamp(0.0, 1.0) as f32;
    if duck <= 0.0 || channels == 0 {
        return;
    }
    let attack_coeff = (-1.0f32 / (0.01 * sample_rate as f32)).exp();
    let release_coeff = (-1.0f32 / (0.2 * sample_rate as f32)).exp();
    let mut env = 0.0f32;
    let frames = (source.len() / channels).min(target.len() / channels);
    for frame in 0..frames {
        let mut x = 0.0f32;
        for ch in 0..channels {
            x += source[frame * channels + ch].abs();
        }
        x /= channels as f32;
        let coeff = if x > env { attack_coeff } else { release_coeff };
        env = x + coeff * (env - x);
        let gain = (1.0 - duck * env.clamp(0.0, 1.0)).clamp(0.0, 1.0);
        for ch in 0..channels {
            target[frame * channels + ch] *= gain;
        }
    }
}

pub fn render_playback_preview(
    project: &Project,
    path: &Path,
    offset_secs: f64,
    duration_secs: f64,
) -> Result<(u32, Vec<f32>), String> {
    let sample_rate = project.sample_rate.max(8000);
    let (src_sr, raw) = decode_audio_mono(path)?;
    let source = resample_linear(&raw, src_sr, sample_rate);
    let start = (offset_secs.max(0.0) * sample_rate as f64).round() as usize;
    let len = (duration_secs.max(0.0) * sample_rate as f64).round() as usize;
    if len == 0 || start >= source.len() {
        return Ok((sample_rate, vec![]));
    }
    let end = (start + len).min(source.len());
    let mut out = source[start..end].to_vec();

    if let Some(asset) = project
        .media
        .iter()
        .find(|asset| same_path(Path::new(asset.path.as_str()), path))
    {
        if let Some(track) = project.tracks.iter().find(|track| {
            track
                .clips
                .iter()
                .any(|clip| clip.media_asset_id == asset.id)
        }) {
            apply_plugin_chain(
                &mut out,
                &track.plugin_chain.instances,
                sample_rate,
                &project.plugin_registry,
            );
            if track.muted {
                out.fill(0.0);
            } else {
                let g = db_to_gain(track.volume_db);
                for sample in out.iter_mut() {
                    *sample *= g;
                }
            }
        }
    }

    for sample in out.iter_mut() {
        *sample = clip_sample(*sample);
    }
    Ok((sample_rate, out))
}

pub fn render_project_tracks(
    project: &Project,
    include_muted: bool,
) -> Result<Vec<RenderedTrack>, String> {
    let sample_rate = project.sample_rate.max(8000);
    let duration = clip_duration_secs(project);
    let total_frames = (duration * sample_rate as f64).ceil() as usize;
    let mut cache = HashMap::new();
    let mut rendered: Vec<RenderedTrack> = project
        .tracks
        .iter()
        .map(|track| RenderedTrack {
            track_id: track.id.clone(),
            name: track.name.clone(),
            samples: render_arrangement_track(
                project,
                track,
                sample_rate,
                total_frames,
                &mut cache,
            ),
            sample_rate,
            channels: 2,
        })
        .collect();

    let index_by_id: HashMap<String, usize> = rendered
        .iter()
        .enumerate()
        .map(|(idx, track)| (track.track_id.clone(), idx))
        .collect();

    for route in &project.sidechain_routes {
        if !route.enabled {
            continue;
        }
        let Some(&source_idx) = index_by_id.get(&route.from_track_id) else {
            continue;
        };
        let Some(&target_idx) = index_by_id.get(&route.to_track_id) else {
            continue;
        };
        if source_idx == target_idx {
            continue;
        }
        if let Some(instance_id) = route.target_plugin_instance_id.as_ref() {
            let target_track = project
                .tracks
                .iter()
                .find(|track| track.id == route.to_track_id);
            let Some(target_track) = target_track else {
                continue;
            };
            let applies = target_track.plugin_chain.instances.iter().any(|instance| {
                instance.id == *instance_id && instance.enabled && !instance.bypassed
            });
            if !applies {
                continue;
            }
        }

        if source_idx < target_idx {
            let (left, right) = rendered.split_at_mut(target_idx);
            let source = &left[source_idx].samples;
            let target = &mut right[0].samples;
            apply_sidechain_ducking(source, target, 2, route.amount, sample_rate);
        } else {
            let (left, right) = rendered.split_at_mut(source_idx);
            let target = &mut left[target_idx].samples;
            let source = &right[0].samples;
            apply_sidechain_ducking(source, target, 2, route.amount, sample_rate);
        }
    }

    if !include_muted {
        let any_solo = project.tracks.iter().any(|track| track.solo);
        let should_render: HashMap<&str, bool> = project
            .tracks
            .iter()
            .map(|track| {
                (
                    track.id.as_str(),
                    track_should_render(track.muted, track.solo, any_solo),
                )
            })
            .collect();
        for track in &mut rendered {
            if !should_render
                .get(track.track_id.as_str())
                .copied()
                .unwrap_or(true)
            {
                track.samples.fill(0.0);
            }
        }
    }

    Ok(rendered)
}

pub fn render_project_track(project: &Project, track_id: &str) -> Result<RenderedTrack, String> {
    let sample_rate = project.sample_rate.max(8000);
    let duration = clip_duration_secs(project);
    let total_frames = (duration * sample_rate as f64).ceil() as usize;
    let mut cache = HashMap::new();

    let track = project
        .tracks
        .iter()
        .find(|track| track.id == track_id)
        .ok_or("Track not found")?;
    let mut target = RenderedTrack {
        track_id: track.id.clone(),
        name: track.name.clone(),
        samples: render_arrangement_track(project, track, sample_rate, total_frames, &mut cache),
        sample_rate,
        channels: 2,
    };

    // Apply only sidechain routes that target this track, rendering only the
    // source tracks needed by those routes.
    for route in project
        .sidechain_routes
        .iter()
        .filter(|route| route.enabled && route.to_track_id == track_id)
    {
        if let Some(instance_id) = route.target_plugin_instance_id.as_ref() {
            let applies = track.plugin_chain.instances.iter().any(|instance| {
                instance.id == *instance_id && instance.enabled && !instance.bypassed
            });
            if !applies {
                continue;
            }
        }
        let Some(source_track) = project
            .tracks
            .iter()
            .find(|entry| entry.id == route.from_track_id)
        else {
            continue;
        };
        let source =
            render_arrangement_track(project, source_track, sample_rate, total_frames, &mut cache);
        apply_sidechain_ducking(&source, &mut target.samples, 2, route.amount, sample_rate);
    }

    Ok(target)
}

/// Write interleaved float samples as a WAV with the given channel count.
pub fn write_wav(
    path: &Path,
    sample_rate: u32,
    channels: u16,
    samples: &[f32],
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let spec = WavSpec {
        channels: channels.max(1),
        sample_rate,
        bits_per_sample: 32,
        sample_format: SampleFormat::Float,
    };
    let mut writer = WavWriter::create(path, spec).map_err(|e| e.to_string())?;
    for sample in samples {
        writer
            .write_sample(sample.clamp(-1.0, 1.0))
            .map_err(|e| e.to_string())?;
    }
    writer.finalize().map_err(|e| e.to_string())
}

/// Mono convenience wrapper, used by recording/engine tests.
#[cfg_attr(not(test), allow(dead_code))]
pub fn write_wav_mono(path: &Path, sample_rate: u32, samples: &[f32]) -> Result<(), String> {
    write_wav(path, sample_rate, 1, samples)
}
