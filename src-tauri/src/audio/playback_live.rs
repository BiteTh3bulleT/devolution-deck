//! Persistent native output. Project/DSP work lives on the producer; the device callback is isolated.
use super::output::{
    AudioFrame, AudioOutput, OutputControl, OutputDiagnostics, OutputSettings, ENGINE_RATE,
};
use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
};
const RATE: u32 = ENGINE_RATE;
const BLOCK: usize = 128;
#[derive(Clone)]
pub(crate) struct PlayingDeck {
    pub id: String,
    pub left: Arc<Vec<f32>>,
    pub right: Arc<Vec<f32>>,
    pub position_secs: f64,
    pub speed: f64,
    pub gain: f32,
    pub cue_gain: f32,
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
    generation: u64,
}
pub struct PlaybackHandle {
    state: Arc<Mutex<OutputState>>,
    control: Arc<OutputControl>,
    output: Mutex<AudioOutput>,
    pending_start: AtomicU64,
}
struct RenderCursor {
    state: Arc<Mutex<OutputState>>,
    control: Arc<OutputControl>,
    block: [AudioFrame; BLOCK],
    index: usize,
    cached_generation: u64,
    clock_frame: u64,
}
impl RenderCursor {
    fn new(state: Arc<Mutex<OutputState>>, control: Arc<OutputControl>) -> Self {
        Self {
            state,
            control,
            block: [AudioFrame::default(); BLOCK],
            index: BLOCK,
            cached_generation: 0,
            clock_frame: 0,
        }
    }
    fn next_frame(&mut self, shutdown: &AtomicBool) -> AudioFrame {
        if self.cached_generation != self.control.generation.load(Ordering::Acquire) {
            self.index = BLOCK;
        }
        if self.index == BLOCK {
            self.refill(shutdown);
        }
        let frame = self.block[self.index];
        self.index += 1;
        frame
    }
    fn refill(&mut self, shutdown: &AtomicBool) {
        // Device replacement may hold this lock while joining the old producer.
        // Observe its shutdown request while waiting; never deadlock a device switch.
        let mut state = loop {
            match self.state.try_lock() {
                Ok(state) => break state,
                Err(std::sync::TryLockError::WouldBlock) if !shutdown.load(Ordering::Acquire) => {
                    std::thread::sleep(std::time::Duration::from_micros(100))
                }
                Err(_) => {
                    self.block.fill(AudioFrame::default());
                    self.index = 0;
                    return;
                }
            }
        };
        if self.cached_generation != state.generation {
            self.clock_frame = self.control.last_clock_frame();
        }
        self.cached_generation = state.generation;
        for frame in &mut self.block {
            *frame = AudioFrame {
                generation: state.generation,
                ..Default::default()
            };
            let mut advanced = false;
            match &mut state.content {
                Content::Silence => {}
                Content::Samples {
                    data,
                    frame: cursor,
                    start_secs,
                    loop_region,
                    ..
                } => {
                    if let Some((a, b)) = loop_region {
                        if *cursor >= ((*b - *start_secs).max(0.0) * RATE as f64).round() as usize {
                            *cursor = ((*a - *start_secs).max(0.0) * RATE as f64).round() as usize;
                        }
                    }
                    if *cursor < data.len() / 2 {
                        advanced = true;
                        frame.left = data[*cursor * 2];
                        frame.right = data[*cursor * 2 + 1];
                        *cursor += 1;
                        frame.position_ms =
                            ((*start_secs + *cursor as f64 / RATE as f64) * 1000.0) as u64;
                        frame.finished = *cursor >= data.len() / 2 && loop_region.is_none();
                    } else {
                        frame.finished = true;
                        frame.position_ms =
                            ((*start_secs + *cursor as f64 / RATE as f64) * 1000.0) as u64;
                    }
                }
                Content::Decks(decks) => {
                    let mut active = false;
                    let mut position = 0.0f64;
                    for deck in decks.iter_mut().filter(|d| d.playing) {
                        if let Some((a, b)) = deck.loop_region {
                            if deck.position_secs >= b {
                                deck.position_secs = a + (deck.position_secs - a).rem_euclid(b - a);
                            }
                        }
                        let f = deck.position_secs * RATE as f64;
                        let i = f.floor() as usize;
                        let len = deck.left.len().min(deck.right.len());
                        if i >= len {
                            deck.playing = false;
                            continue;
                        }
                        let j = (i + 1).min(len - 1);
                        let t = (f - i as f64) as f32;
                        frame.left += (deck.left[i] * (1.0 - t) + deck.left[j] * t) * deck.gain;
                        frame.right += (deck.right[i] * (1.0 - t) + deck.right[j] * t) * deck.gain;
                        frame.cue_left +=
                            (deck.left[i] * (1.0 - t) + deck.left[j] * t) * deck.cue_gain;
                        frame.cue_right +=
                            (deck.right[i] * (1.0 - t) + deck.right[j] * t) * deck.cue_gain;
                        deck.position_secs += deck.speed / RATE as f64;
                        position = position.max(deck.position_secs);
                        active = true;
                    }
                    frame.position_ms = (position * 1000.0) as u64;
                    for deck in decks.iter() {
                        if let Some(index) = match deck.id.as_str() {
                            "A" => Some(0),
                            "B" => Some(1),
                            _ => None,
                        } {
                            frame.deck_positions[index] = deck.position_secs;
                            if deck.playing {
                                frame.deck_mask |= 1 << index;
                            }
                        }
                    }
                    advanced = active;
                    frame.finished = !active;
                }
            }
            if advanced {
                self.clock_frame += 1;
            }
            frame.engine_frame = self.clock_frame;
        }
        self.index = 0;
    }
}
impl PlaybackHandle {
    pub fn new() -> Result<Self, String> {
        let state = Arc::new(Mutex::new(OutputState {
            content: Content::Silence,
            generation: 1,
        }));
        let control = Arc::new(OutputControl::new());
        let mut cursor = RenderCursor::new(state.clone(), control.clone());
        let saved = OutputSettings::load();
        let settings = saved.as_ref().cloned().unwrap_or_default();
        let output = saved
            .and_then(|_| {
                AudioOutput::start(settings.clone(), control.clone(), move |shutdown| {
                    cursor.next_frame(shutdown)
                })
            })
            .unwrap_or_else(|error| AudioOutput::unavailable(settings, error));
        Ok(Self {
            state,
            control,
            output: Mutex::new(output),
            pending_start: AtomicU64::new(0),
        })
    }
    #[cfg(feature = "test-tools")]
    pub fn play_silent_test_decks(&self) -> Result<(), String> {
        let source = Arc::new(vec![0.0; RATE as usize * 2]);
        self.play_decks(vec![
            PlayingDeck {
                id: "A".into(),
                left: source.clone(),
                right: source.clone(),
                position_secs: 0.25,
                speed: 1.0,
                gain: 1.0,
                cue_gain: 0.5,
                loop_region: Some((0.25, 1.0)),
                playing: true,
            },
            PlayingDeck {
                id: "B".into(),
                left: source.clone(),
                right: source,
                position_secs: 0.5,
                speed: 1.01,
                gain: 1.0,
                cue_gain: 0.5,
                loop_region: Some((0.5, 1.2)),
                playing: true,
            },
        ])
    }
    pub fn reserve_start(&self) -> u64 {
        self.pending_start.fetch_add(1, Ordering::AcqRel) + 1
    }
    fn ready(&self) -> Result<(), String> {
        self.output
            .lock()
            .map_err(|_| "Audio settings lock failed")?
            .ready()
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
        if data.is_empty() || !start_secs.is_finite() || start_secs < 0.0 {
            return Err("Invalid playback buffer or position".into());
        }
        let mut state = self.state.lock().map_err(|_| "Audio state lock failed")?;
        self.pending_start.fetch_add(1, Ordering::AcqRel);
        state.content = Content::Samples {
            data,
            frame: 0,
            start_secs,
            loop_region: None,
            arrangement: false,
        };
        state.generation = self.control.advance();
        self.control.start((start_secs * 1000.0) as u64);
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
        if matches!(
            state.content,
            Content::Samples {
                arrangement: true,
                ..
            }
        ) {
            let position = self.position_ms() as f64 / 1000.0;
            state.content = Content::Samples {
                data,
                frame: (position * RATE as f64).round() as usize,
                start_secs: 0.0,
                loop_region,
                arrangement: true,
            };
            state.generation = self.control.advance();
        }
        Ok(())
    }
    pub fn play_arrangement_reserved(
        &self,
        ticket: u64,
        samples: Vec<f32>,
        rate: u32,
        channels: u16,
        position: f64,
        loop_region: Option<(f64, f64)>,
    ) -> Result<(), String> {
        self.ready()?;
        let data = Arc::new(to_stereo(samples, rate, channels)?);
        let frame = (position * RATE as f64).round() as usize;
        if !position.is_finite() || position < 0.0 || frame >= data.len() / 2 {
            return Err("Playback position is outside the arrangement".into());
        }
        let mut state = self.state.lock().map_err(|_| "Audio state lock failed")?;
        if self.pending_start.load(Ordering::Acquire) != ticket {
            return Err("Playback start cancelled".into());
        }
        state.content = Content::Samples {
            data,
            frame,
            start_secs: 0.0,
            loop_region,
            arrangement: true,
        };
        state.generation = self.control.advance();
        self.control.start((position * 1000.0) as u64);
        Ok(())
    }
    pub fn set_loop(&self, region: Option<(f64, f64)>) {
        if let Ok(mut s) = self.state.lock() {
            if let Content::Samples { loop_region, .. } = &mut s.content {
                *loop_region = region;
            }
        }
    }
    /// Gain-only changes keep source cursors, queued frames and clock generation intact.
    pub(crate) fn update_deck_gains(&self, incoming: &[PlayingDeck]) -> Result<bool, String> {
        self.ready()?;
        let mut state=self.state.lock().map_err(|_| "Audio state lock failed")?;
        let Content::Decks(current)=&mut state.content else {return Ok(false);};
        if current.len()!=incoming.len() || !current.iter().all(|deck| incoming.iter().any(|next|
            deck.id==next.id && deck.playing==next.playing && Arc::ptr_eq(&deck.left,&next.left) && Arc::ptr_eq(&deck.right,&next.right))) {return Ok(false);}
        for deck in current {
            let next=incoming.iter().find(|next| next.id==deck.id).ok_or("Deck gain source missing")?;
            deck.gain=next.gain; deck.cue_gain=next.cue_gain;
        }
        Ok(true)
    }
    pub(crate) fn play_decks(&self, decks: Vec<PlayingDeck>) -> Result<(), String> {
        self.ready()?;
        let active = decks.iter().any(|d| d.playing);
        let mut state = self.state.lock().map_err(|_| "Audio state lock failed")?;
        self.pending_start.fetch_add(1, Ordering::AcqRel);
        state.content = Content::Decks(decks);
        state.generation = self.control.advance();
        if active {
            self.control.start(0);
        } else {
            self.control.stop();
        }
        Ok(())
    }
    pub fn performance_snapshot(&self) -> Option<super::output::PerformanceSnapshot> {
        self.control.snapshot()
    }
    pub(crate) fn deck_positions(&self) -> Vec<(String, f64, bool)> {
        let Some(snapshot) = self.control.snapshot() else {
            return vec![];
        };
        self.state
            .lock()
            .ok()
            .map(|state| match &state.content {
                Content::Decks(decks) => decks
                    .iter()
                    .filter_map(|deck| {
                        let index = match deck.id.as_str() {
                            "A" => 0,
                            "B" => 1,
                            _ => return None,
                        };
                        Some((
                            deck.id.clone(),
                            snapshot.deck_positions[index],
                            snapshot.deck_mask & (1 << index) != 0,
                        ))
                    })
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
        if let Ok(mut state) = self.state.lock() {
            self.pending_start.fetch_add(1, Ordering::AcqRel);
            state.content = Content::Silence;
            state.generation = self.control.advance();
            self.control.stop();
        }
    }
    pub fn position_ms(&self) -> u64 {
        self.control.position_ms.load(Ordering::Acquire)
    }
    pub fn is_playing(&self) -> bool {
        self.control.is_playing()
    }
    pub fn seek_ms(&self, ms: u64) {
        if let Ok(mut state) = self.state.lock() {
            if let Content::Samples {
                frame,
                start_secs,
                arrangement: true,
                ..
            } = &mut state.content
            {
                *frame =
                    ((ms as f64 / 1000.0 - *start_secs).max(0.0) * RATE as f64).round() as usize;
                state.generation = self.control.advance();
                self.control.position_ms.store(ms, Ordering::Release);
            }
        }
    }
    pub fn diagnostics(&self) -> Result<OutputDiagnostics, String> {
        Ok(self
            .output
            .lock()
            .map_err(|_| "Output settings lock failed")?
            .diagnostics())
    }
    pub fn reset_statistics(&self) -> Result<(), String> {
        self.output
            .lock()
            .map_err(|_| "Output settings lock failed")?
            .reset_statistics();
        Ok(())
    }
    pub fn configure(&self, settings: OutputSettings) -> Result<OutputDiagnostics, String> {
        settings.validate()?;
        let _state = self.state.lock().map_err(|_| "Audio state lock failed")?;
        if self.is_playing() {
            return Err("Stop playback before changing the output device".into());
        }
        let mut output = self
            .output
            .lock()
            .map_err(|_| "Output settings lock failed")?;
        let state = self.state.clone();
        let control = self.control.clone();
        let mut cursor = RenderCursor::new(state, control.clone());
        let replacement = AudioOutput::start(settings.clone(), control, move |shutdown| {
            cursor.next_frame(shutdown)
        })?;
        settings.save()?;
        *output = replacement;
        Ok(output.diagnostics())
    }
}

fn to_stereo(input: Vec<f32>, rate: u32, channels: u16) -> Result<Vec<f32>, String> {
    if rate == 0
        || channels == 0
        || channels > 32
        || !input.len().is_multiple_of(channels as usize)
        || input.iter().any(|v| !v.is_finite())
    {
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
    fn headless() -> PlaybackHandle {
        PlaybackHandle {
            state: Arc::new(Mutex::new(OutputState {
                content: Content::Silence,
                generation: 1,
            })),
            control: Arc::new(OutputControl::new()),
            output: Mutex::new(AudioOutput::headless()),
            pending_start: AtomicU64::new(0),
        }
    }
    #[test]
    fn native_stop_cancels_a_preparing_arrangement() {
        let playback = headless();
        let ticket = playback.reserve_start();
        playback.stop();
        assert!(playback
            .play_arrangement_reserved(ticket, vec![0.; 128], RATE, 2, 0., None)
            .unwrap_err()
            .contains("cancelled"));
        assert!(!playback.is_playing());
    }
    #[test]
    fn a_new_start_supersedes_an_older_render() {
        let playback = headless();
        let old = playback.reserve_start();
        let latest = playback.reserve_start();
        assert!(playback
            .play_arrangement_reserved(old, vec![0.; 128], RATE, 2, 0., None)
            .is_err());
        playback
            .play_arrangement_reserved(latest, vec![0.; 128], RATE, 2, 0., None)
            .unwrap();
        assert!(playback.is_playing());
    }
    #[test]
    fn changing_crossfader_and_cue_gain_does_not_rewind_or_restart_the_deck() {
        let playback=headless(); let audio=Arc::new(vec![0.2;48000]);
        let original=PlayingDeck{id:"A".into(),left:audio.clone(),right:audio,position_secs:0.5,speed:1.0,gain:1.0,cue_gain:0.0,loop_region:None,playing:true};
        playback.play_decks(vec![original.clone()]).unwrap();
        let generation=playback.control.generation.load(Ordering::Acquire);
        let mut update=original;update.position_secs=0.1;update.gain=0.25;update.cue_gain=0.5;
        assert!(playback.update_deck_gains(&[update]).unwrap());
        assert_eq!(playback.control.generation.load(Ordering::Acquire),generation);
        let state=playback.state.lock().unwrap();
        let Content::Decks(decks)=&state.content else {panic!("Decks disappeared")};
        assert_eq!(decks[0].position_secs,0.5);assert_eq!(decks[0].gain,0.25);assert_eq!(decks[0].cue_gain,0.5);
    }
    #[test]
    fn final_silent_sample_is_counted_in_the_consumed_source_clock() {
        let state = Arc::new(Mutex::new(OutputState {
            generation: 1,
            content: Content::Samples {
                data: Arc::new(vec![0.0; 4]),
                frame: 0,
                start_secs: 0.0,
                loop_region: None,
                arrangement: true,
            },
        }));
        let control = Arc::new(OutputControl::new());
        let mut cursor = RenderCursor::new(state, control);
        let stop = AtomicBool::new(false);
        assert_eq!(cursor.next_frame(&stop).engine_frame, 1);
        let final_frame = cursor.next_frame(&stop);
        assert_eq!(final_frame.engine_frame, 2);
        assert!(final_frame.finished);
        assert_eq!(cursor.next_frame(&stop).engine_frame, 2);
    }
    #[test]
    fn source_change_discards_prefetch_and_continues_the_last_consumed_clock() {
        let state = Arc::new(Mutex::new(OutputState {
            generation: 1,
            content: Content::Samples {
                data: Arc::new(vec![0.0; 1024]),
                frame: 0,
                start_secs: 0.0,
                loop_region: None,
                arrangement: true,
            },
        }));
        let control = Arc::new(OutputControl::new());
        let mut cursor = RenderCursor::new(state.clone(), control.clone());
        let stop = AtomicBool::new(false);
        assert_eq!(cursor.next_frame(&stop).engine_frame, 1);
        control.set_test_clock(1);
        {
            let mut state = state.lock().unwrap();
            state.generation = control.advance();
        }
        assert_eq!(cursor.next_frame(&stop).engine_frame, 2);
    }
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
            generation: 1,
            content: Content::Decks(vec![PlayingDeck {
                id: "A".into(),
                left: Arc::new(vec![0.25; 8]),
                right: Arc::new(vec![0.5; 8]),
                position_secs: 0.0,
                speed: 1.0,
                gain: 1.0,
                cue_gain: 0.0,
                loop_region: Some((0.0, 8.0 / RATE as f64)),
                playing: true,
            }]),
        }));
        let control = Arc::new(OutputControl::new());
        let mut renderer = RenderCursor::new(state, control);
        for _ in 0..1000 {
            let frame = renderer.next_frame(&AtomicBool::new(false));
            assert_eq!(frame.left, 0.25);
            assert_eq!(frame.right, 0.5);
            assert!(!frame.finished);
        }
    }
    #[test]
    fn seek_discards_worker_prefetch() {
        let state = Arc::new(Mutex::new(OutputState {
            generation: 1,
            content: Content::Samples {
                data: Arc::new(vec![0.2; 1024]),
                frame: 0,
                start_secs: 0.0,
                loop_region: None,
                arrangement: true,
            },
        }));
        let control = Arc::new(OutputControl::new());
        let mut renderer = RenderCursor::new(state.clone(), control.clone());
        renderer.next_frame(&AtomicBool::new(false));
        {
            let mut guard = state.lock().unwrap();
            guard.content = Content::Samples {
                data: Arc::new(vec![0.8; 1024]),
                frame: 0,
                start_secs: 1.0,
                loop_region: None,
                arrangement: true,
            };
            guard.generation = control.advance();
        }
        let frame = renderer.next_frame(&AtomicBool::new(false));
        assert_eq!(frame.left, 0.8);
        assert_eq!(frame.generation, 2);
        assert_eq!(frame.position_ms, 1000);
    }
    #[test]
    fn render_cursor_does_not_advance_the_audible_clock() {
        let state = Arc::new(Mutex::new(OutputState {
            generation: 1,
            content: Content::Samples {
                data: Arc::new(vec![0.2; 1024]),
                frame: 0,
                start_secs: 0.0,
                loop_region: None,
                arrangement: true,
            },
        }));
        let control = Arc::new(OutputControl::new());
        let mut renderer = RenderCursor::new(state, control.clone());
        for _ in 0..256 {
            renderer.next_frame(&AtomicBool::new(false));
        }
        assert_eq!(control.position_ms.load(Ordering::Relaxed), 0);
    }
}
