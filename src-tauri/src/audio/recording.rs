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
