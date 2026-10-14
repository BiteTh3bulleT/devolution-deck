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
    /// Destination path.
    pub output_path: PathBuf,
    /// Background thread that owns the cpal Stream.
    pub thread: Option<std::thread::JoinHandle<()>>,
    pub error: Arc<Mutex<Option<String>>>,
}

// Safety: all fields except `thread` are already Send.
// JoinHandle is Send. We never share the cpal Stream across threads —
// it lives inside the spawned thread and is dropped there.
impl Drop for RecordingHandle {
    fn drop(&mut self) {
        self.stop_flag.store(true, Ordering::Relaxed);
    }
}

/// Enumerate available audio input device names.
pub fn list_input_devices() -> Result<Vec<String>, String> {
    let host = cpal::default_host();
    let devices = host
        .input_devices()
        .map_err(|e| format!("Failed to enumerate input devices: {e}"))?;
    let names: Vec<String> = devices.filter_map(|d| d.name().ok()).collect();
    Ok(names)
}

/// Stream capture through a bounded queue to disk, flushing the WAV header regularly.
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
    let sample_format = supported_config.sample_format();
    let mut stream_config: cpal::StreamConfig = supported_config.into();
    if let Some(buffer_ms) = target_buffer_ms {
        let frames = ((sample_rate as u64 * buffer_ms as u64) / 1000).max(32) as u32;
        stream_config.buffer_size = match device
            .default_input_config()
            .map_err(|e| e.to_string())?
            .buffer_size()
        {
            cpal::SupportedBufferSize::Range { min, max } => {
                cpal::BufferSize::Fixed(frames.clamp(*min, *max))
            }
            cpal::SupportedBufferSize::Unknown => cpal::BufferSize::Default,
        };
    }

    let spec = hound::WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };

    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop_flag_thread = Arc::clone(&stop_flag);
    let error = Arc::new(Mutex::new(None));
    let error_thread = error.clone();
    let (ready_tx, ready_rx) = std::sync::mpsc::sync_channel(1);
    let (samples_tx, samples_rx) = std::sync::mpsc::sync_channel::<Vec<f32>>(32);
    let capture_path = output_path.to_path_buf();

    // Spawn a thread that owns the cpal Stream (which is !Send).
    let thread = std::thread::spawn(move || {
        let mut writer = match hound::WavWriter::create(&capture_path, spec) {
            Ok(writer) => writer,
            Err(e) => {
                let _ = ready_tx.send(Err(format!("Cannot create capture WAV: {e}")));
                return;
            }
        };
        let stream = match sample_format {
            cpal::SampleFormat::F32 => {
                build_stream::<f32>(&device, &stream_config, samples_tx, error_thread.clone())
            }
            cpal::SampleFormat::F64 => {
                build_stream::<f64>(&device, &stream_config, samples_tx, error_thread.clone())
            }
            cpal::SampleFormat::I8 => {
                build_stream::<i8>(&device, &stream_config, samples_tx, error_thread.clone())
            }
            cpal::SampleFormat::U8 => {
                build_stream::<u8>(&device, &stream_config, samples_tx, error_thread.clone())
            }
            cpal::SampleFormat::I16 => {
                build_stream::<i16>(&device, &stream_config, samples_tx, error_thread.clone())
            }
            cpal::SampleFormat::U16 => {
                build_stream::<u16>(&device, &stream_config, samples_tx, error_thread.clone())
            }
            cpal::SampleFormat::I32 => {
                build_stream::<i32>(&device, &stream_config, samples_tx, error_thread.clone())
            }
            cpal::SampleFormat::U32 => {
                build_stream::<u32>(&device, &stream_config, samples_tx, error_thread.clone())
            }
            cpal::SampleFormat::I64 => {
                build_stream::<i64>(&device, &stream_config, samples_tx, error_thread.clone())
            }
            cpal::SampleFormat::U64 => {
                build_stream::<u64>(&device, &stream_config, samples_tx, error_thread.clone())
            }
            other => Err(format!("Unsupported input sample format: {other:?}")),
        };

        let stream = match stream {
            Ok(s) => s,
            Err(e) => {
                let _ = ready_tx.send(Err(e));
                return;
            }
        };

        if let Err(e) = stream.play() {
            let _ = ready_tx.send(Err(e.to_string()));
            return;
        }
        if ready_tx.send(Ok(())).is_err() {
            return;
        }

        let mut last_flush = std::time::Instant::now();
        while !stop_flag_thread.load(Ordering::Relaxed) {
            if error_thread.lock().map(|e| e.is_some()).unwrap_or(true) {
                break;
            }
            if let Ok(samples) = samples_rx.recv_timeout(std::time::Duration::from_millis(50)) {
                if let Err(e) = write_capture_block(&mut writer, &samples) {
                    if let Ok(mut error) = error_thread.lock() {
                        *error = Some(e);
                    }
                    break;
                }
            }
            if last_flush.elapsed().as_secs() >= 1 {
                if let Err(e) = writer.flush() {
                    if let Ok(mut error) = error_thread.lock() {
                        *error = Some(e.to_string());
                    }
                    break;
                }
                last_flush = std::time::Instant::now();
            }
        }

        // stream is dropped here, stopping capture.
        drop(stream);
        for samples in samples_rx.try_iter() {
            if let Err(e) = write_capture_block(&mut writer, &samples) {
                if let Ok(mut error) = error_thread.lock() {
                    *error = Some(e);
                }
                break;
            }
        }
        if let Err(e) = writer.finalize() {
            if let Ok(mut error) = error_thread.lock() {
                *error = Some(e.to_string());
            }
        }
    });

    match ready_rx.recv_timeout(std::time::Duration::from_secs(5)) {
        Ok(Ok(())) => {}
        result => {
            stop_flag.store(true, Ordering::Relaxed);
            let _ = thread.join();
            return Err(match result {
                Ok(Err(e)) => e,
                _ => "Input device startup timed out".into(),
            });
        }
    }

    Ok(RecordingHandle {
        stop_flag,
        output_path: output_path.to_path_buf(),
        thread: Some(thread),
        error,
    })
}

fn build_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    samples: std::sync::mpsc::SyncSender<Vec<f32>>,
    error: Arc<Mutex<Option<String>>>,
) -> Result<cpal::Stream, String>
where
    T: cpal::SizedSample,
    f32: cpal::FromSample<T>,
{
    let callback_error = error.clone();
    device
        .build_input_stream(
            config,
            move |data: &[T], _| {
                let block = data
                    .iter()
                    .map(|s| <f32 as cpal::FromSample<T>>::from_sample_(*s))
                    .collect();
                if samples.try_send(block).is_err() {
                    if let Ok(mut e) = callback_error.lock() {
                        *e = Some("Capture queue overflow; partial take is preserved".into());
                    }
                }
            },
            move |e| {
                if let Ok(mut error) = error.lock() {
                    *error = Some(e.to_string());
                }
            },
            None,
        )
        .map_err(|e| e.to_string())
}
fn write_capture_block<W: std::io::Write + std::io::Seek>(
    writer: &mut hound::WavWriter<W>,
    samples: &[f32],
) -> Result<(), String> {
    for sample in samples {
        writer.write_sample(*sample).map_err(|e| e.to_string())?;
    }
    Ok(())
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

    let reader =
        hound::WavReader::open(wav_path).map_err(|e| format!("Recorded WAV is unreadable: {e}"))?;
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

        let placement = import_recording_to_timeline(&mut project, &wav, 8.0).expect("placement");
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

/// Stop capture after draining its bounded queue, finalize the WAV, and return its path.
pub fn stop_recording(mut handle: RecordingHandle) -> Result<PathBuf, String> {
    // Signal thread to stop and wait for it.
    handle.stop_flag.store(true, Ordering::Relaxed);
    if let Some(t) = handle.thread.take() {
        if let Err(e) = t.join() {
            eprintln!("[recording] recording thread panicked: {:?}", e);
            return Err("Recording thread panicked".to_string());
        }
    }

    let path = handle.output_path.clone();
    if let Some(error) = handle
        .error
        .lock()
        .map_err(|_| "Capture error lock failed")?
        .as_ref()
    {
        return Err(format!(
            "{error}. Captured WAV preserved at {}",
            path.display()
        ));
    }
    let reader = hound::WavReader::open(&path).map_err(|e| e.to_string())?;
    if reader.duration() == 0 {
        return Err("Recording contains no captured audio".into());
    }
    Ok(path)
}
