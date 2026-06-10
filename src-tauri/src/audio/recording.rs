//! Audio recording via cpal input stream + hound WAV writer.
//! Phase 2: real device enumeration, real WAV capture.
//! If no input device is available the commands return a clear error.
//!
//! The cpal Stream is !Send, so we can't store it in AppState directly.
//! Instead we use a stop flag (AtomicBool) + a join handle for the recording
//! thread that owns the stream. The handle stored in AppState is Send.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

/// Handle kept in AppState while recording is active.
/// Both fields are Send, so this struct is Send + Sync.
pub struct RecordingHandle {
    /// Set to true to signal the recording thread to stop.
    pub stop_flag: Arc<AtomicBool>,
    /// Shared sample buffer (also read by stop_recording to flush to WAV).
    pub samples: Arc<Mutex<Vec<f32>>>,
    /// WAV spec used when flushing.
    pub spec: hound::WavSpec,
    /// Destination path.
    pub output_path: PathBuf,
    /// Background thread that owns the cpal Stream.
    pub thread: Option<std::thread::JoinHandle<()>>,
}

// Safety: all fields except `thread` are already Send.
// JoinHandle is Send. We never share the cpal Stream across threads —
// it lives inside the spawned thread and is dropped there.
unsafe impl Send for RecordingHandle {}

/// Enumerate available audio input device names.
pub fn list_input_devices() -> Result<Vec<String>, String> {
    let host = cpal::default_host();
    let devices = host
        .input_devices()
        .map_err(|e| format!("Failed to enumerate input devices: {e}"))?;
    let names: Vec<String> = devices.filter_map(|d| d.name().ok()).collect();
    Ok(names)
}

/// Open an input stream on a background thread and start buffering samples.
/// `device_name = None` uses the default input device.
pub fn start_recording(
    device_name: Option<&str>,
    output_path: &Path,
    target_buffer_ms: Option<u32>,
) -> Result<RecordingHandle, String> {
    let host = cpal::default_host();

    let device = if let Some(name) = device_name {
        host.input_devices()
            .map_err(|e| e.to_string())?
            .find(|d| d.name().ok().as_deref() == Some(name))
            .ok_or_else(|| format!("Input device '{name}' not found"))?
    } else {
        host.default_input_device().ok_or(
            "No default input device available. Audio recording is not supported on this device.",
        )?
    };

    let supported_config = device
        .default_input_config()
        .map_err(|e| format!("No input config: {e}"))?;

    let sample_rate = supported_config.sample_rate().0;
    let channels = supported_config.channels();
    let mut stream_config: cpal::StreamConfig = supported_config.into();
    if let Some(buffer_ms) = target_buffer_ms {
        let frames = ((sample_rate as u64 * buffer_ms as u64) / 1000).max(32) as u32;
        stream_config.buffer_size = cpal::BufferSize::Fixed(frames);
    }

    let spec = hound::WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };

    let samples: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let samples_cb = Arc::clone(&samples);
    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop_flag_thread = Arc::clone(&stop_flag);
    let output_path_buf = output_path.to_path_buf();

    // Spawn a thread that owns the cpal Stream (which is !Send).
    let thread = std::thread::spawn(move || {
        let stream = device.build_input_stream(
            &stream_config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                if let Ok(mut buf) = samples_cb.lock() {
                    buf.extend_from_slice(data);
                }
            },
            |err| eprintln!("[recording] stream error: {err}"),
            None,
        );

        let stream = match stream {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[recording] failed to build stream: {e}");
                return;
            }
        };

        if let Err(e) = stream.play() {
            eprintln!("[recording] failed to start stream: {e}");
            return;
        }

        // Keep the stream alive until stop_flag is set.
        while !stop_flag_thread.load(Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        // stream is dropped here, stopping capture.
        drop(stream);
        drop(output_path_buf); // unused in thread, just for move semantics
    });

    Ok(RecordingHandle {
        stop_flag,
        samples,
        spec,
        output_path: output_path.to_path_buf(),
        thread: Some(thread),
    })
}

/// Result of placing a finished recording onto the timeline.
#[derive(Debug, Clone)]
pub struct RecordingPlacement {
    pub asset: crate::models::MediaAsset,
    pub clip: crate::models::TimelineClip,
    pub track_id: String,
}

/// Import a finished recording WAV into the project as a media asset and
/// place it as a clip at `start_secs` on the first armed audio track.
/// This is the DAW half of recording: capture alone is not enough.
pub fn import_recording_to_timeline(
    project: &mut crate::models::Project,
    wav_path: &Path,
    start_secs: f64,
) -> Result<RecordingPlacement, String> {
    let track_id = project
        .tracks
        .iter()
        .find(|track| track.armed && track.track_type == crate::models::TrackType::Audio)
        .map(|track| track.id.clone())
        .ok_or("No armed audio track to receive the recording")?;

    let reader = hound::WavReader::open(wav_path)
        .map_err(|e| format!("Recorded WAV is unreadable: {e}"))?;
    let spec = reader.spec();
    let frames = reader.duration() as f64;
    let duration_secs = frames / spec.sample_rate.max(1) as f64;
    if duration_secs <= 0.0 {
        return Err("Recorded WAV contains no audio".to_string());
    }

    let asset = crate::models::MediaAsset {
        id: uuid::Uuid::new_v4().to_string(),
        name: wav_path
            .file_stem()
            .map(|stem| stem.to_string_lossy().to_string())
            .unwrap_or_else(|| "Recording".to_string()),
        path: wav_path.to_string_lossy().to_string(),
        duration_secs,
        sample_rate: spec.sample_rate,
        channels: spec.channels,
    };
    project.media.push(asset.clone());

    let clip = crate::models::TimelineClip {
        id: uuid::Uuid::new_v4().to_string(),
        media_asset_id: asset.id.clone(),
        start_secs: start_secs.max(0.0),
        source_offset_secs: 0.0,
        duration_secs,
        warp: None,
        slice_markers: vec![],
    };
    let track = project
        .tracks
        .iter_mut()
        .find(|track| track.id == track_id)
        .ok_or("Armed track disappeared during placement")?;
    track.clips.push(clip.clone());

    Ok(RecordingPlacement {
        asset,
        clip,
        track_id,
    })
}

#[cfg(test)]
mod tests {
    use super::import_recording_to_timeline;
    use crate::models::{Project, Track, TrackType};

    fn audio_track(id: &str, armed: bool) -> Track {
        Track {
            id: id.to_string(),
            name: id.to_string(),
            index: 0,
            track_type: TrackType::Audio,
            clips: vec![],
            midi_clips: vec![],
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
            armed,
        }
    }

    fn temp_wav(samples: &[f32], sample_rate: u32) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "devodeck_rec_test_{}_{}.wav",
            std::process::id(),
            samples.len()
        ));
        crate::audio::render::write_wav_mono(&path, sample_rate, samples).expect("test wav");
        path
    }

    #[test]
    fn places_recording_as_clip_on_armed_audio_track() {
        let mut project = Project::default();
        project.tracks.push(audio_track("unarmed", false));
        project.tracks.push(audio_track("armed-target", true));
        let wav = temp_wav(&vec![0.5f32; 8000], 8000);

        let placement =
            import_recording_to_timeline(&mut project, &wav, 8.0).expect("placement");
        let _ = std::fs::remove_file(&wav);

        assert_eq!(placement.track_id, "armed-target");
        assert_eq!(project.media.len(), 1);
        assert!((placement.asset.duration_secs - 1.0).abs() < 1e-6);
        let track = &project.tracks[1];
        assert_eq!(track.clips.len(), 1);
        assert_eq!(track.clips[0].start_secs, 8.0);
        assert!((track.clips[0].duration_secs - 1.0).abs() < 1e-6);
        assert_eq!(track.clips[0].media_asset_id, placement.asset.id);
        assert!(project.tracks[0].clips.is_empty());
    }

    #[test]
    fn errors_when_no_armed_audio_track() {
        let mut project = Project::default();
        project.tracks.push(audio_track("unarmed", false));
        let wav = temp_wav(&vec![0.5f32; 100], 8000);

        let err = import_recording_to_timeline(&mut project, &wav, 0.0)
            .expect_err("must require an armed track");
        let _ = std::fs::remove_file(&wav);

        assert!(err.contains("armed"), "unexpected error: {err}");
        assert!(project.media.is_empty());
    }

    #[test]
    fn errors_on_empty_recording() {
        let mut project = Project::default();
        project.tracks.push(audio_track("armed", true));
        let path = std::env::temp_dir().join(format!(
            "devodeck_rec_test_empty_{}.wav",
            std::process::id()
        ));
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 8000,
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        };
        hound::WavWriter::create(&path, spec)
            .expect("writer")
            .finalize()
            .expect("finalize");

        let err = import_recording_to_timeline(&mut project, &path, 0.0)
            .expect_err("must reject empty recording");
        let _ = std::fs::remove_file(&path);

        assert!(err.contains("no audio"), "unexpected error: {err}");
        assert!(project.media.is_empty());
    }
}

/// Signal the recording thread to stop, join it, flush samples to WAV, return path.
pub fn stop_recording(mut handle: RecordingHandle) -> Result<PathBuf, String> {
    // Signal thread to stop and wait for it.
    handle.stop_flag.store(true, Ordering::Relaxed);
    if let Some(t) = handle.thread.take() {
        if let Err(e) = t.join() {
            eprintln!("[recording] recording thread panicked: {:?}", e);
            return Err("Recording thread panicked".to_string());
        }
    }

    let samples = handle
        .samples
        .lock()
        .map_err(|_| "sample buffer lock error")?
        .clone();
    let spec = handle.spec;
    let path = handle.output_path.clone();

    let mut writer =
        hound::WavWriter::create(&path, spec).map_err(|e| format!("Failed to create WAV: {e}"))?;

    for sample in &samples {
        writer
            .write_sample(*sample)
            .map_err(|e| format!("WAV write error: {e}"))?;
    }

    writer
        .finalize()
        .map_err(|e| format!("WAV finalize error: {e}"))?;
    Ok(path)
}
