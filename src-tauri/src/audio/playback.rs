//! Playback engine: runs on a dedicated thread (rodio/cpal not Send on all platforms).
//! App state holds only command channel and position atomic.

use rodio::Source;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

pub enum PlaybackCommand {
    Play {
        path: std::path::PathBuf,
        offset_secs: f64,
        duration_secs: f64,
    },
    PlaySamples {
        samples: Vec<f32>,
        sample_rate: u32,
        channels: u16,
        start_position_secs: f64,
    },
    Stop,
    /// Seek to a position in seconds. If currently playing, restarts audio from new position.
    Seek {
        position_secs: f64,
    },
}

enum ActiveSource {
    Path {
        path: std::path::PathBuf,
        start_offset_secs: f64,
        full_duration_secs: f64,
    },
    Samples {
        samples: Arc<Vec<f32>>,
        sample_rate: u32,
        channels: u16,
        start_offset_secs: f64,
    },
}

/// Handle to control playback and read position. Safe to share with Tauri State.
pub struct PlaybackHandle {
    pub tx: mpsc::Sender<PlaybackCommand>,
    pub position_ms: Arc<AtomicU64>,
    pub is_playing: Arc<AtomicBool>,
}

impl PlaybackHandle {
    pub fn new() -> Result<Self, String> {
        let (tx, rx) = mpsc::channel();
        let position_ms = Arc::new(AtomicU64::new(0));
        let is_playing = Arc::new(AtomicBool::new(false));
        let position_clone = Arc::clone(&position_ms);
        let is_playing_clone = Arc::clone(&is_playing);

        thread::spawn(move || {
            let (_stream, stream_handle) = match rodio::OutputStream::try_default() {
                Ok(s) => s,
                Err(_) => return,
            };
            let mut _current_sink: Option<rodio::Sink> = None;
            let mut play_start = None::<(Instant, f64)>;
            let mut current_duration = 0.0f64;
            let mut active_source: Option<ActiveSource> = None;

            // Helper closure-like: attempt to start playback from a given offset
            let start_playback = |path: &std::path::Path,
                                  offset_secs: f64,
                                  duration_secs: f64,
                                  stream_handle: &rodio::OutputStreamHandle|
             -> Option<rodio::Sink> {
                let file = std::fs::File::open(path).ok()?;
                let source = rodio::Decoder::new(std::io::BufReader::new(file)).ok()?;
                let source = source
                    .skip_duration(Duration::from_secs_f64(offset_secs))
                    .take_duration(Duration::from_secs_f64(duration_secs));
                let sink = rodio::Sink::try_new(stream_handle).ok()?;
                sink.append(source);
                Some(sink)
            };
            let start_samples = |samples: &[f32],
                                 sample_rate: u32,
                                 channels: u16,
                                 start_frame: usize,
                                 stream_handle: &rodio::OutputStreamHandle|
             -> Option<rodio::Sink> {
                if start_frame >= samples.len() {
                    return None;
                }
                let sink = rodio::Sink::try_new(stream_handle).ok()?;
                let source = rodio::buffer::SamplesBuffer::new(
                    channels.max(1),
                    sample_rate,
                    samples[start_frame..].to_vec(),
                );
                sink.append(source);
                Some(sink)
            };

            loop {
                match rx.try_recv() {
                    Ok(PlaybackCommand::Stop) => {
                        _current_sink = None;
                        play_start = None;
                        active_source = None;
                        is_playing_clone.store(false, Ordering::SeqCst);
                        position_clone.store(0, Ordering::SeqCst);
                    }
                    Ok(PlaybackCommand::Play {
                        path,
                        offset_secs,
                        duration_secs,
                    }) => {
                        _current_sink = None;
                        if let Some(sink) =
                            start_playback(&path, offset_secs, duration_secs, &stream_handle)
                        {
                            _current_sink = Some(sink);
                            play_start = Some((Instant::now(), offset_secs));
                            current_duration = duration_secs;
                            active_source = Some(ActiveSource::Path {
                                path,
                                start_offset_secs: offset_secs,
                                full_duration_secs: duration_secs,
                            });
                            position_clone.store((offset_secs * 1000.0) as u64, Ordering::SeqCst);
                            is_playing_clone.store(true, Ordering::SeqCst);
                        } else {
                            active_source = None;
                            play_start = None;
                            current_duration = 0.0;
                            is_playing_clone.store(false, Ordering::SeqCst);
                        }
                    }
                    Ok(PlaybackCommand::PlaySamples {
                        samples,
                        sample_rate,
                        channels,
                        start_position_secs,
                    }) => {
                        _current_sink = None;
                        let shared = Arc::new(samples);
                        if let Some(sink) = start_samples(
                            shared.as_slice(),
                            sample_rate,
                            channels,
                            0,
                            &stream_handle,
                        ) {
                            let duration_secs = shared.len() as f64
                                / sample_rate.max(1) as f64
                                / channels.max(1) as f64;
                            _current_sink = Some(sink);
                            play_start = Some((Instant::now(), start_position_secs));
                            current_duration = duration_secs;
                            active_source = Some(ActiveSource::Samples {
                                samples: shared,
                                sample_rate,
                                channels,
                                start_offset_secs: start_position_secs,
                            });
                            position_clone
                                .store((start_position_secs * 1000.0) as u64, Ordering::SeqCst);
                            is_playing_clone.store(true, Ordering::SeqCst);
                        } else {
                            active_source = None;
                            play_start = None;
                            current_duration = 0.0;
                            is_playing_clone.store(false, Ordering::SeqCst);
                        }
                    }
                    Ok(PlaybackCommand::Seek { position_secs }) => {
                        let pos_ms = (position_secs * 1000.0) as u64;
                        position_clone.store(pos_ms, Ordering::SeqCst);

                        // If currently playing, restart audio from new position
                        if let Some(ref source) = active_source {
                            _current_sink = None;
                            match source {
                                ActiveSource::Path {
                                    path,
                                    start_offset_secs,
                                    full_duration_secs,
                                } => {
                                    let clip_end = *start_offset_secs + *full_duration_secs;
                                    let seek_position = position_secs.max(*start_offset_secs);
                                    let remaining = (clip_end - seek_position).max(0.0);
                                    if remaining > 0.0 {
                                        if let Some(sink) = start_playback(
                                            path,
                                            seek_position,
                                            remaining,
                                            &stream_handle,
                                        ) {
                                            _current_sink = Some(sink);
                                            play_start = Some((Instant::now(), seek_position));
                                            current_duration = remaining;
                                            is_playing_clone.store(true, Ordering::SeqCst);
                                        }
                                    } else {
                                        play_start = None;
                                        is_playing_clone.store(false, Ordering::SeqCst);
                                    }
                                }
                                ActiveSource::Samples {
                                    samples,
                                    sample_rate,
                                    channels,
                                    start_offset_secs,
                                } => {
                                    let requested = (position_secs - *start_offset_secs).max(0.0);
                                    let start_frame = (requested
                                        * *sample_rate as f64
                                        * (*channels).max(1) as f64)
                                        .round()
                                        as usize;
                                    if let Some(sink) = start_samples(
                                        samples.as_slice(),
                                        *sample_rate,
                                        *channels,
                                        start_frame,
                                        &stream_handle,
                                    ) {
                                        _current_sink = Some(sink);
                                        play_start = Some((Instant::now(), position_secs));
                                        current_duration =
                                            (samples.len().saturating_sub(start_frame)) as f64
                                                / (*sample_rate).max(1) as f64
                                                / (*channels).max(1) as f64;
                                        is_playing_clone.store(true, Ordering::SeqCst);
                                    } else {
                                        play_start = None;
                                        is_playing_clone.store(false, Ordering::SeqCst);
                                    }
                                }
                            }
                        }
                    }
                    Err(mpsc::TryRecvError::Disconnected) => break,
                    Err(mpsc::TryRecvError::Empty) => {}
                }

                if let Some((start, offset)) = play_start {
                    let elapsed = start.elapsed().as_secs_f64();
                    let actual_position = offset + elapsed;
                    position_clone.store((actual_position * 1000.0) as u64, Ordering::SeqCst);
                    if elapsed >= current_duration {
                        _current_sink = None;
                        play_start = None;
                        is_playing_clone.store(false, Ordering::SeqCst);
                    }
                }

                thread::sleep(Duration::from_millis(50));
            }
        });

        Ok(Self {
            tx,
            position_ms,
            is_playing,
        })
    }

    pub fn play(&self, path: &Path, offset_secs: f64, duration_secs: f64) -> Result<(), String> {
        self.tx
            .send(PlaybackCommand::Play {
                path: path.to_path_buf(),
                offset_secs,
                duration_secs,
            })
            .map_err(|e| e.to_string())
    }

    pub fn play_samples(
        &self,
        samples: Vec<f32>,
        sample_rate: u32,
        channels: u16,
        start_position_secs: f64,
    ) -> Result<(), String> {
        self.tx
            .send(PlaybackCommand::PlaySamples {
                samples,
                sample_rate,
                channels,
                start_position_secs,
            })
            .map_err(|e| e.to_string())
    }

    pub fn stop(&self) {
        let _ = self.tx.send(PlaybackCommand::Stop);
    }

    pub fn position_ms(&self) -> u64 {
        self.position_ms.load(Ordering::SeqCst)
    }

    pub fn is_playing(&self) -> bool {
        self.is_playing.load(Ordering::SeqCst)
    }

    /// Seek to a position in seconds. If playing, restarts audio from the new position.
    /// If not playing, just updates the reported position.
    pub fn seek_ms(&self, ms: u64) {
        let secs = ms as f64 / 1000.0;
        let _ = self.tx.send(PlaybackCommand::Seek {
            position_secs: secs,
        });
    }
}
