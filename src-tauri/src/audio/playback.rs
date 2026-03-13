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
    Stop,
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
            let (_stream, stream_handle) =
                match rodio::OutputStream::try_default() {
                    Ok(s) => s,
                    Err(_) => return,
                };
            let mut _current_sink: Option<rodio::Sink> = None;
            let mut play_start = None::<(Instant, f64)>;
            let mut current_duration = 0.0f64;

            loop {
                match rx.try_recv() {
                    Ok(PlaybackCommand::Stop) => {
                        _current_sink = None;
                        play_start = None;
                        is_playing_clone.store(false, Ordering::SeqCst);
                        position_clone.store(0, Ordering::SeqCst);
                    }
                    Ok(PlaybackCommand::Play {
                        path,
                        offset_secs,
                        duration_secs,
                    }) => {
                        _current_sink = None;
                        if let Ok(file) = std::fs::File::open(&path) {
                            if let Ok(source) =
                                rodio::Decoder::new(std::io::BufReader::new(file))
                            {
                                let source = source
                                    .skip_duration(Duration::from_secs_f64(offset_secs))
                                    .take_duration(Duration::from_secs_f64(duration_secs));
                                if let Ok(sink) =
                                    rodio::Sink::try_new(&stream_handle)
                                {
                                    sink.append(source);
                                    _current_sink = Some(sink);
                                    play_start = Some((Instant::now(), 0.0));
                                    current_duration = duration_secs;
                                    is_playing_clone.store(true, Ordering::SeqCst);
                                }
                            }
                        }
                    }
                    Err(mpsc::TryRecvError::Disconnected) => break,
                    Err(mpsc::TryRecvError::Empty) => {}
                }

                if let Some((start, _)) = play_start {
                    let elapsed = start.elapsed().as_secs_f64();
                    position_clone.store((elapsed * 1000.0) as u64, Ordering::SeqCst);
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

    pub fn play(
        &self,
        path: &Path,
        offset_secs: f64,
        duration_secs: f64,
    ) -> Result<(), String> {
        self.tx
            .send(PlaybackCommand::Play {
                path: path.to_path_buf(),
                offset_secs,
                duration_secs,
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
}
