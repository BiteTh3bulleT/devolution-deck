//! A persistent output sink reads shared state; controls never restart the device.
use rodio::Source;
use std::{
    collections::VecDeque,
    path::Path,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
const RATE: u32 = 48000;
#[derive(Clone)]
pub(crate) struct PlayingDeck {
    pub id: String,
    pub left: Arc<Vec<f32>>,
    pub right: Arc<Vec<f32>>,
    pub position_secs: f64,
    pub speed: f64,
    pub gain: f32,
    pub loop_region: Option<(f64, f64)>,
    pub playing: bool,
}
enum Content {
    Silence,
    Samples {
        data: Arc<Vec<f32>>,
        frame: usize,
        start_secs: f64,
        loop_region: Option<(f64, f64)>,
        arrangement: bool,
    },
    Decks(Vec<PlayingDeck>),
}
struct OutputState {
    content: Content,
}
pub struct PlaybackHandle {
    state: Arc<Mutex<OutputState>>,
    pub position_ms: Arc<AtomicU64>,
    pub is_playing: Arc<AtomicBool>,
    startup_error: Option<String>,
}
struct LiveSource {
    state: Arc<Mutex<OutputState>>,
    position: Arc<AtomicU64>,
    playing: Arc<AtomicBool>,
    block: VecDeque<f32>,
}
impl LiveSource {
    fn refill(&mut self) {
        let Ok(mut state) = self.state.lock() else {
            self.block.extend([0.0; 256]);
            return;
        };
        for _ in 0..128 {
            let (mut l, mut r) = (0.0, 0.0);
            match &mut state.content {
                Content::Silence => {}
                Content::Samples {
                    data,
                    frame,
                    start_secs,
                    loop_region,
                    ..
                } => {
                    if let Some((a, b)) = loop_region {
                        if *frame >= ((*b - *start_secs).max(0.0) * RATE as f64).round() as usize {
                            *frame = ((*a - *start_secs).max(0.0) * RATE as f64).round() as usize;
                        }
                    }
                    if *frame < data.len() / 2 {
                        l = data[*frame * 2];
                        r = data[*frame * 2 + 1];
                        *frame += 1;
                        self.position.store(
                            ((*start_secs + *frame as f64 / RATE as f64) * 1000.0) as u64,
                            Ordering::Relaxed,
                        );
                    } else {
                        self.playing.store(false, Ordering::Relaxed);
                    }
                }
                Content::Decks(decks) => {
                    let mut active = false;
                    for d in decks.iter_mut().filter(|d| d.playing) {
                        if let Some((a, b)) = d.loop_region {
                            if d.position_secs >= b {
                                d.position_secs = a + (d.position_secs - a).rem_euclid(b - a);
                            }
                        }
                        let f = d.position_secs * RATE as f64;
                        let i = f.floor() as usize;
                        let len = d.left.len().min(d.right.len());
                        if i >= len {
                            d.playing = false;
                            continue;
                        }
                        let j = (i + 1).min(len - 1);
                        let t = (f - i as f64) as f32;
                        l += (d.left[i] * (1.0 - t) + d.left[j] * t) * d.gain;
                        r += (d.right[i] * (1.0 - t) + d.right[j] * t) * d.gain;
                        d.position_secs += d.speed / RATE as f64;
                        active = true;
                    }
                    self.playing.store(active, Ordering::Relaxed);
                }
            }
            self.block.push_back(l.clamp(-1.0, 1.0));
            self.block.push_back(r.clamp(-1.0, 1.0));
        }
    }
}
impl Iterator for LiveSource {
    type Item = f32;
    fn next(&mut self) -> Option<f32> {
        if self.block.is_empty() {
            self.refill();
        }
        self.block.pop_front()
    }
}
impl Source for LiveSource {
    fn current_frame_len(&self) -> Option<usize> {
        None
    }
    fn channels(&self) -> u16 {
        2
    }
    fn sample_rate(&self) -> u32 {
        RATE
    }
    fn total_duration(&self) -> Option<Duration> {
        None
    }
}
impl PlaybackHandle {
    pub fn new() -> Result<Self, String> {
        let state = Arc::new(Mutex::new(OutputState {
            content: Content::Silence,
        }));
        let position_ms = Arc::new(AtomicU64::new(0));
        let is_playing = Arc::new(AtomicBool::new(false));
        let source = LiveSource {
            state: state.clone(),
            position: position_ms.clone(),
            playing: is_playing.clone(),
            block: VecDeque::new(),
        };
        let (tx, rx) = std::sync::mpsc::sync_channel(1);
        std::thread::spawn(move || match rodio::OutputStream::try_default() {
            Ok((_stream, handle)) => match rodio::Sink::try_new(&handle) {
                Ok(sink) => {
                    sink.append(source);
                    let _ = tx.send(Ok(()));
                    sink.sleep_until_end();
                }
                Err(e) => {
                    let _ = tx.send(Err(e.to_string()));
                }
            },
            Err(e) => {
                let _ = tx.send(Err(e.to_string()));
            }
        });
        let startup_error = match rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(())) => None,
            Ok(Err(e)) => Some(e),
            Err(e) => Some(e.to_string()),
        };
        Ok(Self {
            state,
            position_ms,
            is_playing,
            startup_error,
        })
    }
    fn ready(&self) -> Result<(), String> {
        self.startup_error
            .as_ref()
            .map(|e| Err(format!("Audio output unavailable: {e}")))
            .unwrap_or(Ok(()))
    }
    pub fn play(&self, path: &Path, offset: f64, duration: f64) -> Result<(), String> {
        let (rate, source) = super::render::decode_audio_stereo(path)?;
        let start = (offset.max(0.0) * rate as f64).round() as usize;
        let end =
            (start + (duration.max(0.0) * rate as f64).round() as usize).min(source.left.len());
        if start >= end {
            return Err("Playback range has no audio".into());
        }
        let samples = source.left[start..end]
            .iter()
            .zip(&source.right[start..end])
            .flat_map(|(l, r)| [*l, *r])
            .collect();
        self.play_samples(samples, rate, 2, offset)
    }
    pub fn play_samples(
        &self,
        samples: Vec<f32>,
        rate: u32,
        channels: u16,
        start_secs: f64,
    ) -> Result<(), String> {
        self.ready()?;
        let data = Arc::new(to_stereo(samples, rate, channels)?);
        if data.is_empty() {
            return Err("Playback buffer is empty".into());
        }
        self.state
            .lock()
            .map_err(|_| "Audio state lock failed")?
            .content = Content::Samples {
            data,
            frame: 0,
            start_secs,
            loop_region: None,
            arrangement: false,
        };
        self.position_ms
            .store((start_secs * 1000.0) as u64, Ordering::Relaxed);
        self.is_playing.store(true, Ordering::Relaxed);
        Ok(())
    }
    pub fn replace_samples(
        &self,
        samples: Vec<f32>,
        rate: u32,
        channels: u16,
        loop_region: Option<(f64, f64)>,
    ) -> Result<(), String> {
        let data = Arc::new(to_stereo(samples, rate, channels)?);
        let mut state = self.state.lock().map_err(|_| "Audio state lock failed")?;
        if let Content::Samples {
            frame,
            start_secs,
            arrangement: true,
            ..
        } = &state.content
        {
            let position = *start_secs + *frame as f64 / RATE as f64;
            state.content = Content::Samples {
                data,
                frame: (position * RATE as f64).round() as usize,
                start_secs: 0.0,
                loop_region,
                arrangement: true,
            };
        }
        Ok(())
    }
    pub fn play_arrangement(
        &self,
        samples: Vec<f32>,
        rate: u32,
        channels: u16,
        position: f64,
        loop_region: Option<(f64, f64)>,
    ) -> Result<(), String> {
        self.ready()?;
        let data = Arc::new(to_stereo(samples, rate, channels)?);
        self.state
            .lock()
            .map_err(|_| "Audio state lock failed")?
            .content = Content::Samples {
            data,
            frame: (position * RATE as f64).round() as usize,
            start_secs: 0.0,
            loop_region,
            arrangement: true,
        };
        self.position_ms
            .store((position * 1000.0) as u64, Ordering::Relaxed);
        self.is_playing.store(true, Ordering::Relaxed);
        Ok(())
    }
    pub fn set_loop(&self, region: Option<(f64, f64)>) {
        if let Ok(mut s) = self.state.lock() {
            if let Content::Samples { loop_region, .. } = &mut s.content {
                *loop_region = region;
            }
        }
    }
    pub(crate) fn play_decks(&self, decks: Vec<PlayingDeck>) -> Result<(), String> {
        self.ready()?;
        self.is_playing
            .store(decks.iter().any(|d| d.playing), Ordering::Relaxed);
        self.state
            .lock()
            .map_err(|_| "Audio state lock failed")?
            .content = Content::Decks(decks);
        Ok(())
    }
    pub(crate) fn deck_positions(&self) -> Vec<(String, f64, bool)> {
        self.state
            .lock()
            .ok()
            .map(|s| match &s.content {
                Content::Decks(ds) => ds
                    .iter()
                    .map(|d| (d.id.clone(), d.position_secs, d.playing))
                    .collect(),
                _ => vec![],
            })
            .unwrap_or_default()
    }
    pub fn is_arrangement(&self) -> bool {
        self.state
            .lock()
            .map(|s| {
                matches!(
                    s.content,
                    Content::Samples {
                        arrangement: true,
                        ..
                    }
                )
            })
            .unwrap_or(false)
    }
    pub fn stop(&self) {
        if let Ok(mut s) = self.state.lock() {
            s.content = Content::Silence;
        }
        self.is_playing.store(false, Ordering::Relaxed);
        self.position_ms.store(0, Ordering::Relaxed);
    }
    pub fn position_ms(&self) -> u64 {
        self.position_ms.load(Ordering::Relaxed)
    }
    pub fn is_playing(&self) -> bool {
        self.is_playing.load(Ordering::Relaxed)
    }
    pub fn seek_ms(&self, ms: u64) {
        if let Ok(mut s) = self.state.lock() {
            if let Content::Samples {
                frame,
                start_secs,
                arrangement: true,
                ..
            } = &mut s.content
            {
                *frame =
                    ((ms as f64 / 1000.0 - *start_secs).max(0.0) * RATE as f64).round() as usize;
            }
        }
        self.position_ms.store(ms, Ordering::Relaxed);
    }
}
fn to_stereo(input: Vec<f32>, rate: u32, channels: u16) -> Result<Vec<f32>, String> {
    if rate == 0 || channels == 0 || channels > 32 {
        return Err("Invalid audio format".into());
    }
    if channels == 2 && rate == RATE {
        return Ok(input);
    }
    let frames = input.len() / channels as usize;
    let count = (frames as f64 * RATE as f64 / rate as f64).ceil() as usize;
    let mut out = Vec::with_capacity(count * 2);
    for frame in 0..count {
        let p = frame as f64 * rate as f64 / RATE as f64;
        let i = p.floor() as usize;
        if i >= frames {
            break;
        }
        let j = (i + 1).min(frames - 1);
        let t = (p - i as f64) as f32;
        for c in 0..2 {
            let c = c.min(channels as usize - 1);
            out.push(
                input[i * channels as usize + c] * (1.0 - t) + input[j * channels as usize + c] * t,
            );
        }
    }
    Ok(out)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stereo_conversion_preserves_channels() {
        assert_eq!(
            to_stereo(vec![0.2, -0.3], 48000, 2).unwrap(),
            vec![0.2, -0.3]
        );
        assert_eq!(to_stereo(vec![0.5], 48000, 1).unwrap(), vec![0.5, 0.5]);
    }
    #[test]
    fn deck_loop_keeps_playing_past_source_end() {
        let state = Arc::new(Mutex::new(OutputState {
            content: Content::Decks(vec![PlayingDeck {
                id: "A".into(),
                left: Arc::new(vec![0.25; 8]),
                right: Arc::new(vec![0.5; 8]),
                position_secs: 0.0,
                speed: 1.0,
                gain: 1.0,
                loop_region: Some((0.0, 8.0 / RATE as f64)),
                playing: true,
            }]),
        }));
        let mut source = LiveSource {
            state,
            position: Arc::new(AtomicU64::new(0)),
            playing: Arc::new(AtomicBool::new(true)),
            block: VecDeque::new(),
        };
        for _ in 0..1000 {
            assert_eq!(source.next(), Some(0.25));
            assert_eq!(source.next(), Some(0.5));
        }
        assert!(source.playing.load(Ordering::Relaxed));
    }
}
