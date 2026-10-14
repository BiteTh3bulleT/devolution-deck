//! The device callback reads a fixed-capacity SPSC queue; DSP and project locks stay on its producer thread.
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use rtrb::{Consumer, RingBuffer};
use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicUsize, Ordering},
    Arc,
};
use std::time::{Duration, Instant};

pub const ENGINE_RATE: u32 = 48_000;
pub const QUEUE_CAPACITY: usize = 8192;
fn queue_target(requested: u32, observed: usize) -> usize {
    (requested as usize * 2)
        .max(if observed == 0 { 512 } else { observed * 2 })
        .min(QUEUE_CAPACITY / 2)
}
#[derive(Clone, Copy, Default, Debug)]
pub(crate) struct AudioFrame {
    pub left: f32,
    pub right: f32,
    pub cue_left: f32,
    pub cue_right: f32,
    pub position_ms: u64,
    pub generation: u64,
    pub finished: bool,
    pub engine_frame: u64,
    pub deck_positions: [f64; 2],
    pub deck_mask: u8,
}
/// Single callback writer, bounded snapshot readers; no locks or allocation.
#[derive(Clone, Copy, Default, Debug, Serialize)]
pub struct PerformanceSnapshot {
    pub generation: u64,
    pub engine_frame: u64,
    pub position_ms: u64,
    pub deck_positions: [f64; 2],
    pub deck_mask: u8,
    pub main_peak: f32,
    pub cue_peak: f32,
}
#[derive(Default)]
struct Telemetry {
    sequence: AtomicU64,
    generation: AtomicU64,
    clock: AtomicU64,
    position: AtomicU64,
    decks: [AtomicU64; 2],
    mask: AtomicU32,
    main: AtomicU32,
    cue: AtomicU32,
}
impl Telemetry {
    fn publish(&self, value: PerformanceSnapshot) {
        self.sequence.fetch_add(1, Ordering::SeqCst);
        self.generation.store(value.generation, Ordering::SeqCst);
        self.clock.store(value.engine_frame, Ordering::SeqCst);
        self.position.store(value.position_ms, Ordering::SeqCst);
        for i in 0..2 {
            self.decks[i].store(value.deck_positions[i].to_bits(), Ordering::SeqCst);
        }
        self.mask.store(value.deck_mask as u32, Ordering::SeqCst);
        self.main.store(value.main_peak.to_bits(), Ordering::SeqCst);
        self.cue.store(value.cue_peak.to_bits(), Ordering::SeqCst);
        self.sequence.fetch_add(1, Ordering::SeqCst);
    }
    fn read(&self) -> Option<PerformanceSnapshot> {
        for _ in 0..3 {
            let before = self.sequence.load(Ordering::SeqCst);
            if before & 1 != 0 {
                continue;
            }
            let result = PerformanceSnapshot {
                generation: self.generation.load(Ordering::SeqCst),
                engine_frame: self.clock.load(Ordering::SeqCst),
                position_ms: self.position.load(Ordering::SeqCst),
                deck_positions: std::array::from_fn(|i| {
                    f64::from_bits(self.decks[i].load(Ordering::SeqCst))
                }),
                deck_mask: self.mask.load(Ordering::SeqCst) as u8,
                main_peak: f32::from_bits(self.main.load(Ordering::SeqCst)),
                cue_peak: f32::from_bits(self.cue.load(Ordering::SeqCst)),
            };
            if before == self.sequence.load(Ordering::SeqCst) {
                return Some(result);
            }
        }
        None
    }
}
#[derive(Default)]
struct Statistics {
    callbacks: AtomicU64,
    underrun_frames: AtomicU64,
    underrun_callbacks: AtomicU64,
    invalid_samples: AtomicU64,
    clipped_samples: AtomicU64,
    max_callback_ns: AtomicU64,
    total_callback_ns: AtomicU64,
    callback_frames: AtomicUsize,
    queue_frames: AtomicUsize,
    device_errors: AtomicU64,
}
pub(crate) struct OutputControl {
    pub generation: AtomicU64,
    requested: AtomicBool,
    finished_generation: AtomicU64,
    pub position_ms: AtomicU64,
    telemetry: Telemetry,
    consumed_clock: AtomicU64,
}
impl OutputControl {
    pub fn new() -> Self {
        Self {
            generation: AtomicU64::new(1),
            requested: AtomicBool::new(false),
            finished_generation: AtomicU64::new(0),
            position_ms: AtomicU64::new(0),
            telemetry: Telemetry::default(),
            consumed_clock: AtomicU64::new(0),
        }
    }
    pub fn snapshot(&self) -> Option<PerformanceSnapshot> {
        self.telemetry
            .read()
            .filter(|s| s.generation == self.generation.load(Ordering::Acquire))
    }
    #[cfg(test)]
    pub fn set_test_clock(&self, frame: u64) {
        self.consumed_clock.store(frame, Ordering::Release);
    }
    pub fn last_clock_frame(&self) -> u64 {
        self.consumed_clock.load(Ordering::Acquire)
    }
    pub fn advance(&self) -> u64 {
        self.generation.fetch_add(1, Ordering::AcqRel) + 1
    }
    pub fn start(&self, position: u64) {
        self.position_ms.store(position, Ordering::Release);
        self.requested.store(true, Ordering::Release);
    }
    pub fn stop(&self) {
        self.requested.store(false, Ordering::Release);
        self.position_ms.store(0, Ordering::Release);
    }
    pub fn is_playing(&self) -> bool {
        self.requested.load(Ordering::Acquire)
            && self.finished_generation.load(Ordering::Acquire)
                != self.generation.load(Ordering::Acquire)
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct OutputSettings {
    pub device_name: Option<String>,
    pub sample_rate: Option<u32>,
    pub buffer_frames: u32,
    pub main_channels: [u16; 2],
    pub cue_channels: Option<[u16; 2]>,
    pub cue_gain_db: f64,
}
impl Default for OutputSettings {
    fn default() -> Self {
        Self {
            device_name: None,
            sample_rate: None,
            buffer_frames: 256,
            main_channels: [0, 1],
            cue_channels: None,
            cue_gain_db: -12.0,
        }
    }
}
impl OutputSettings {
    pub fn load() -> Result<Self, String> {
        let path = Self::path()?;
        if !path.exists() {
            return Ok(Self::default());
        }
        let settings: Self =
            serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
                .map_err(|e| format!("Invalid saved output settings: {e}"))?;
        settings.validate()?;
        Ok(settings)
    }
    fn path() -> Result<std::path::PathBuf, String> {
        #[cfg(target_os = "macos")]
        let root = std::env::var_os("HOME")
            .map(|home| std::path::PathBuf::from(home).join("Library/Application Support"))
            .ok_or("Home directory unavailable")?;
        #[cfg(not(target_os = "macos"))]
        let root = std::env::var_os("LOCALAPPDATA")
            .ok_or("Local application data directory unavailable")?;
        Ok(std::path::PathBuf::from(root)
            .join("devolution-deck")
            .join("audio-output.json"))
    }
    pub fn save(&self) -> Result<(), String> {
        use std::io::Write;
        self.validate()?;
        let path = Self::path()?;
        let parent = path.parent().ok_or("Invalid output settings path")?;
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
        temp.write_all(&serde_json::to_vec_pretty(self).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        temp.as_file().sync_all().map_err(|e| e.to_string())?;
        temp.persist(path).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.main_channels[0] == self.main_channels[1]
            || self.main_channels.iter().any(|c| *c >= 32)
        {
            return Err("Choose two distinct main output channels".into());
        }
        if let Some(cue) = self.cue_channels {
            if cue[0] == cue[1]
                || cue
                    .iter()
                    .any(|c| *c >= 32 || self.main_channels.contains(c))
            {
                return Err("Cue must use a separate output channel pair".into());
            }
        }
        if !self.cue_gain_db.is_finite() || !(-60.0..=0.0).contains(&self.cue_gain_db) {
            return Err("Cue level must be between -60 and 0 dB".into());
        }

        if !self.buffer_frames.is_power_of_two() || !(64..=2048).contains(&self.buffer_frames) {
            return Err("Buffer must be a power of two between 64 and 2048 frames".into());
        }
        if self
            .sample_rate
            .is_some_and(|r| !(8000..=192000).contains(&r))
        {
            return Err("Output sample rate must be between 8 and 192 kHz".into());
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize)]
pub struct OutputDiagnostics {
    pub settings: OutputSettings,
    pub host: String,
    pub device_name: Option<String>,
    pub sample_rate: u32,
    pub engine_sample_rate: u32,
    pub channels: u16,
    pub sample_format: String,
    pub fixed_device_buffer: Option<u32>,
    pub observed_callback_frames: usize,
    pub software_queue_target_frames: usize,
    pub queued_frames: usize,
    pub callbacks: u64,
    pub underrun_frames: u64,
    pub underrun_callbacks: u64,
    pub invalid_samples: u64,
    pub clipped_samples: u64,
    pub callback_max_us: f64,
    pub callback_average_us: f64,
    pub callback_load_percent: f64,
    pub estimated_output_latency_ms: Option<f64>,
    pub error: Option<String>,
}
struct DeviceInfo {
    host: String,
    name: String,
    rate: u32,
    channels: u16,
    format: String,
    fixed_buffer: Option<u32>,
}
struct CallbackKernel {
    queue: Consumer<AudioFrame>,
    control: Arc<OutputControl>,
    stats: Arc<Statistics>,
    armed_generation: u64,
    pending: Option<AudioFrame>,
    main_channels: [u16; 2],
    cue_channels: Option<[u16; 2]>,
    cue_gain: f32,
}
impl CallbackKernel {
    fn next(&mut self, epoch: u64) -> Option<AudioFrame> {
        if let Some(frame) = self.pending.take() {
            if frame.generation == epoch {
                return Some(frame);
            }
        }
        for _ in 0..QUEUE_CAPACITY {
            match self.queue.pop() {
                Ok(frame) if frame.generation == epoch => return Some(frame),
                Ok(_) => continue,
                Err(_) => return None,
            }
        }
        None
    }
    /// Never waits, allocates, logs or acquires a mutex. Stale-queue drain is bounded by queue capacity.
    fn fill<T: cpal::Sample + cpal::FromSample<f32>>(&mut self, data: &mut [T], channels: usize) {
        let began = Instant::now();
        let mut missing = 0u64;
        let mut bad = 0u64;
        let mut clipped = 0u64;
        let mut position = None;
        let mut main_peak = 0.0f32;
        let mut cue_peak = 0.0f32;
        let epoch = self.control.generation.load(Ordering::Acquire);
        let callback_epoch = epoch;
        let mut priming = false;
        if self.control.is_playing() && self.armed_generation != epoch {
            let first = self.next(epoch);
            let required = (data.len() / channels.max(1)).min(QUEUE_CAPACITY / 2);
            priming =
                first.is_none() || self.queue.slots() + usize::from(first.is_some()) < required;
            self.pending = first;
        }
        for output in data.chunks_mut(channels.max(1)) {
            let epoch = self.control.generation.load(Ordering::Acquire);
            let value = if priming || epoch != callback_epoch {
                None
            } else {
                self.next(epoch)
            };
            let active = self.control.is_playing();
            let mut bus = [0.0f32; 4];
            if active {
                if let Some(frame) = value {
                    self.armed_generation = epoch;
                    bus[0] = frame.left;
                    bus[1] = frame.right;
                    if self.cue_channels.is_some() {
                        bus[2] = frame.cue_left * self.cue_gain;
                        bus[3] = frame.cue_right * self.cue_gain;
                    }
                    position = Some(PerformanceSnapshot {
                        generation: epoch,
                        engine_frame: frame.engine_frame,
                        position_ms: frame.position_ms,
                        deck_positions: frame.deck_positions,
                        deck_mask: frame.deck_mask,
                        ..Default::default()
                    });
                    if frame.finished {
                        self.control
                            .finished_generation
                            .store(epoch, Ordering::Release);
                    }
                } else if !priming && self.armed_generation == epoch {
                    missing += 1;
                }
            }
            for sample in &mut bus {
                if !sample.is_finite() {
                    *sample = 0.0;
                    bad += 1;
                }
                clipped += u64::from(sample.abs() > 1.0);
                *sample = sample.clamp(-1.0, 1.0);
            }
            main_peak = main_peak.max(if channels == 1 {
                ((bus[0] + bus[1]) * 0.5).abs()
            } else {
                bus[0].abs().max(bus[1].abs())
            });
            cue_peak = cue_peak.max(bus[2].abs()).max(bus[3].abs());
            for (i, sample) in output.iter_mut().enumerate() {
                let value = if channels == 1 {
                    (bus[0] + bus[1]) * 0.5
                } else if i == self.main_channels[0] as usize {
                    bus[0]
                } else if i == self.main_channels[1] as usize {
                    bus[1]
                } else if self.cue_channels.is_some_and(|c| i == c[0] as usize) {
                    bus[2]
                } else if self.cue_channels.is_some_and(|c| i == c[1] as usize) {
                    bus[3]
                } else {
                    0.0
                };
                *sample = T::from_sample(value);
            }
        }
        if let Some(mut snapshot) = position {
            snapshot.main_peak = main_peak;
            snapshot.cue_peak = cue_peak;
            if self.control.generation.load(Ordering::Acquire) == snapshot.generation {
                snapshot.engine_frame = self
                    .control
                    .consumed_clock
                    .fetch_max(snapshot.engine_frame, Ordering::AcqRel)
                    .max(snapshot.engine_frame);
                self.control.telemetry.publish(snapshot);
                self.control
                    .position_ms
                    .store(snapshot.position_ms, Ordering::Release);
            }
        }
        let duration = began.elapsed().as_nanos().min(u64::MAX as u128) as u64;
        self.stats.callbacks.fetch_add(1, Ordering::Relaxed);
        self.stats
            .total_callback_ns
            .fetch_add(duration, Ordering::Relaxed);
        self.stats
            .max_callback_ns
            .fetch_max(duration, Ordering::Relaxed);
        self.stats
            .callback_frames
            .store(data.len() / channels.max(1), Ordering::Relaxed);
        if missing > 0 {
            self.stats
                .underrun_frames
                .fetch_add(missing, Ordering::Relaxed);
            self.stats
                .underrun_callbacks
                .fetch_add(1, Ordering::Relaxed);
        }
        self.stats.invalid_samples.fetch_add(bad, Ordering::Relaxed);
        self.stats
            .clipped_samples
            .fetch_add(clipped, Ordering::Relaxed);
    }
}
fn stream<T: cpal::SizedSample + cpal::FromSample<f32>>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    mut kernel: CallbackKernel,
) -> Result<cpal::Stream, String> {
    let channels = config.channels as usize;
    let stats = kernel.stats.clone();
    let control = kernel.control.clone();
    device
        .build_output_stream(
            config,
            move |data: &mut [T], _| kernel.fill(data, channels),
            move |_| {
                stats.device_errors.fetch_add(1, Ordering::Relaxed);
                control.finished_generation.store(
                    control.generation.load(Ordering::Acquire),
                    Ordering::Release,
                );
            },
            None,
        )
        .map_err(|e| e.to_string())
}
fn choose(
    settings: &OutputSettings,
) -> Result<(cpal::Device, cpal::SupportedStreamConfig, DeviceInfo), String> {
    settings.validate()?;
    let host = cpal::default_host();
    let device = match settings.device_name.as_deref() {
        Some(name) => host
            .output_devices()
            .map_err(|e| e.to_string())?
            .find(|d| d.name().ok().as_deref() == Some(name))
            .ok_or_else(|| format!("Output device '{name}' is unavailable"))?,
        None => host
            .default_output_device()
            .ok_or("No default output device")?,
    };
    let default = device.default_output_config().map_err(|e| e.to_string())?;
    let desired = settings.sample_rate.unwrap_or(ENGINE_RATE);
    let required = settings
        .main_channels
        .iter()
        .copied()
        .chain(settings.cue_channels.into_iter().flatten())
        .max()
        .unwrap_or(1)
        + 1;
    let mut candidates: Vec<_> = device
        .supported_output_configs()
        .map_err(|e| e.to_string())?
        .filter(|c| {
            c.min_sample_rate().0 <= desired
                && c.max_sample_rate().0 >= desired
                && c.channels() <= 32
                && c.channels() >= required
        })
        .collect();
    candidates.sort_by_key(|c| {
        (
            c.channels() != 2,
            c.sample_format() != cpal::SampleFormat::F32,
            c.channels(),
        )
    });
    let config = if let Some(range) = candidates.into_iter().next() {
        range.with_sample_rate(cpal::SampleRate(desired))
    } else if settings.sample_rate.is_none() {
        default
    } else {
        return Err(format!("Device does not support {desired} Hz"));
    };
    if config.channels() < required
        && !(config.channels() == 1
            && settings.cue_channels.is_none()
            && settings.main_channels == [0, 1])
    {
        return Err("Selected channel routing is not supported by this device".into());
    }
    if config.channels() == 0 || config.channels() > 32 {
        return Err("Output requires between 1 and 32 hardware channels".into());
    }
    let fixed_buffer = match config.buffer_size() {
        cpal::SupportedBufferSize::Range { min, max } => {
            Some(settings.buffer_frames.clamp(*min, *max))
        }
        cpal::SupportedBufferSize::Unknown => None,
    };
    let info = DeviceInfo {
        host: host.id().name().to_owned(),
        name: device.name().unwrap_or_else(|_| "Unknown output".into()),
        rate: config.sample_rate().0,
        channels: config.channels(),
        format: format!("{:?}", config.sample_format()),
        fixed_buffer,
    };
    Ok((device, config, info))
}
/// Owned by the control plane. CPAL stream lifetime and DSP producer live on a separate thread.
pub struct AudioOutput {
    settings: OutputSettings,
    info: Option<DeviceInfo>,
    stats: Arc<Statistics>,
    stop: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
    error: Option<String>,
}
impl AudioOutput {
    pub(crate) fn unavailable(settings: OutputSettings, error: String) -> Self {
        Self {
            settings,
            info: None,
            stats: Arc::new(Statistics::default()),
            stop: Arc::new(AtomicBool::new(true)),
            thread: None,
            error: Some(error),
        }
    }
    #[cfg(test)]
    pub(crate) fn headless() -> Self {
        let mut output = Self::unavailable(OutputSettings::default(), String::new());
        output.error = None;
        output
    }
    pub(crate) fn start<F: FnMut(&AtomicBool) -> AudioFrame + Send + 'static>(
        settings: OutputSettings,
        control: Arc<OutputControl>,
        mut render: F,
    ) -> Result<Self, String> {
        settings.validate()?;
        let stats = Arc::new(Statistics::default());
        let stop = Arc::new(AtomicBool::new(false));
        let producer_stats = stats.clone();
        let stop_worker = stop.clone();
        let worker_settings = settings.clone();
        let (tx, rx) = std::sync::mpsc::sync_channel(1);
        let thread = std::thread::Builder::new()
            .name("devolution-audio-producer".into())
            .spawn(move || {
                let result = (|| -> Result<(), String> {
                    let (device, supported, info) = choose(&worker_settings)?;
                    let rate = info.rate;
                    let mut config = supported.config();
                    if let Some(frames) = info.fixed_buffer {
                        config.buffer_size = cpal::BufferSize::Fixed(frames);
                    }
                    let (mut producer, consumer) = RingBuffer::new(QUEUE_CAPACITY);
                    let kernel = CallbackKernel {
                        queue: consumer,
                        control: control.clone(),
                        stats: producer_stats.clone(),
                        armed_generation: 0,
                        pending: None,
                        main_channels: worker_settings.main_channels,
                        cue_channels: worker_settings.cue_channels,
                        cue_gain: 10f32.powf(worker_settings.cue_gain_db as f32 / 20.0),
                    };
                    let stream = match supported.sample_format() {
                        cpal::SampleFormat::F32 => stream::<f32>(&device, &config, kernel),
                        cpal::SampleFormat::F64 => stream::<f64>(&device, &config, kernel),
                        cpal::SampleFormat::I8 => stream::<i8>(&device, &config, kernel),
                        cpal::SampleFormat::I16 => stream::<i16>(&device, &config, kernel),
                        cpal::SampleFormat::I32 => stream::<i32>(&device, &config, kernel),
                        cpal::SampleFormat::I64 => stream::<i64>(&device, &config, kernel),
                        cpal::SampleFormat::U8 => stream::<u8>(&device, &config, kernel),
                        cpal::SampleFormat::U16 => stream::<u16>(&device, &config, kernel),
                        cpal::SampleFormat::U32 => stream::<u32>(&device, &config, kernel),
                        cpal::SampleFormat::U64 => stream::<u64>(&device, &config, kernel),
                        format => Err(format!("Unsupported output format {format:?}")),
                    }?;
                    stream.play().map_err(|e| e.to_string())?;
                    let _ = tx.send(Ok(info));

                    let mut current = AudioFrame::default();
                    let mut next = AudioFrame::default();
                    let mut phase = 0.0;
                    let mut cached_epoch = 0;
                    while !stop_worker.load(Ordering::Acquire) {
                        let queued = QUEUE_CAPACITY - producer.slots();
                        producer_stats.queue_frames.store(queued, Ordering::Relaxed);
                        let observed = producer_stats.callback_frames.load(Ordering::Relaxed);
                        let target = queue_target(worker_settings.buffer_frames, observed);
                        if queued >= target {
                            std::thread::sleep(Duration::from_micros(250));
                            continue;
                        }
                        let epoch = control.generation.load(Ordering::Acquire);
                        let frame = if rate == ENGINE_RATE {
                            render(&stop_worker)
                        } else {
                            if cached_epoch != epoch {
                                current = render(&stop_worker);
                                next = render(&stop_worker);
                                phase = 0.0;
                                cached_epoch = epoch;
                            }
                            let t = phase as f32;
                            let out = AudioFrame {
                                left: current.left * (1.0 - t) + next.left * t,
                                right: current.right * (1.0 - t) + next.right * t,
                                cue_left: current.cue_left * (1.0 - t) + next.cue_left * t,
                                cue_right: current.cue_right * (1.0 - t) + next.cue_right * t,
                                position_ms: current.position_ms,
                                generation: current.generation,
                                finished: current.finished,
                                engine_frame: current.engine_frame,
                                deck_positions: current.deck_positions,
                                deck_mask: current.deck_mask,
                            };
                            phase += ENGINE_RATE as f64 / rate as f64;
                            while phase >= 1.0 {
                                current = next;
                                next = render(&stop_worker);
                                phase -= 1.0;
                            }
                            out
                        };
                        let _ = producer.push(frame);
                    }
                    drop(stream);
                    Ok(())
                })();
                if let Err(error) = result {
                    let _ = tx.send(Err(error));
                }
            })
            .map_err(|e| e.to_string())?;
        match rx.recv_timeout(Duration::from_secs(8)) {
            Ok(Ok(info)) => Ok(Self {
                settings,
                info: Some(info),
                stats,
                stop,
                thread: Some(thread),
                error: None,
            }),
            Ok(Err(error)) => {
                stop.store(true, Ordering::Release);
                let _ = thread.join();
                Err(error)
            }
            Err(error) => {
                stop.store(true, Ordering::Release);
                Err(format!("Audio device initialization timed out: {error}"))
            }
        }
    }
    pub fn ready(&self) -> Result<(), String> {
        if let Some(error) = &self.error {
            return Err(format!("Audio output unavailable: {error}"));
        }
        if self.stats.device_errors.load(Ordering::Relaxed) > 0 {
            return Err("Audio stream failed; reopen the output device in System".into());
        }
        Ok(())
    }
    pub fn diagnostics(&self) -> OutputDiagnostics {
        let callbacks = self.stats.callbacks.load(Ordering::Relaxed);
        let callback_frames = self.stats.callback_frames.load(Ordering::Relaxed);
        let average = self.stats.total_callback_ns.load(Ordering::Relaxed) as f64
            / callbacks.max(1) as f64
            / 1000.0;
        let rate = self.info.as_ref().map(|i| i.rate).unwrap_or(0);
        let target = queue_target(self.settings.buffer_frames, callback_frames);
        OutputDiagnostics {
            settings: self.settings.clone(),
            host: self
                .info
                .as_ref()
                .map(|i| i.host.clone())
                .unwrap_or_default(),
            device_name: self.info.as_ref().map(|i| i.name.clone()),
            sample_rate: rate,
            engine_sample_rate: ENGINE_RATE,
            channels: self.info.as_ref().map(|i| i.channels).unwrap_or(0),
            sample_format: self
                .info
                .as_ref()
                .map(|i| i.format.clone())
                .unwrap_or_default(),
            fixed_device_buffer: self.info.as_ref().and_then(|i| i.fixed_buffer),
            observed_callback_frames: callback_frames,
            software_queue_target_frames: target,
            queued_frames: self.stats.queue_frames.load(Ordering::Relaxed),
            callbacks,
            underrun_frames: self.stats.underrun_frames.load(Ordering::Relaxed),
            underrun_callbacks: self.stats.underrun_callbacks.load(Ordering::Relaxed),
            invalid_samples: self.stats.invalid_samples.load(Ordering::Relaxed),
            clipped_samples: self.stats.clipped_samples.load(Ordering::Relaxed),
            callback_max_us: self.stats.max_callback_ns.load(Ordering::Relaxed) as f64 / 1000.0,
            callback_average_us: average,
            callback_load_percent: if rate > 0 && callback_frames > 0 {
                average / (callback_frames as f64 / rate as f64 * 1e6) * 100.0
            } else {
                0.0
            },
            estimated_output_latency_ms: if rate > 0 && callback_frames > 0 {
                Some((callback_frames + target) as f64 / rate as f64 * 1000.0)
            } else {
                None
            },
            error: self.ready().err(),
        }
    }
    pub fn reset_statistics(&self) {
        self.stats.callbacks.store(0, Ordering::Relaxed);
        self.stats.total_callback_ns.store(0, Ordering::Relaxed);
        self.stats.underrun_frames.store(0, Ordering::Relaxed);
        self.stats.underrun_callbacks.store(0, Ordering::Relaxed);
        self.stats.invalid_samples.store(0, Ordering::Relaxed);
        self.stats.clipped_samples.store(0, Ordering::Relaxed);
        self.stats.max_callback_ns.store(0, Ordering::Relaxed);
    }
}
impl Drop for AudioOutput {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}
#[cfg(test)]
mod allocation_probe {
    use std::{
        alloc::{GlobalAlloc, Layout, System},
        cell::Cell,
    };
    thread_local! { static ENABLED: Cell<bool> = const { Cell::new(false) }; static CALLS: Cell<usize> = const { Cell::new(0) }; }
    struct Probe;
    #[global_allocator]
    static ALLOCATOR: Probe = Probe;
    fn count() {
        ENABLED.with(|enabled| {
            if enabled.get() {
                CALLS.with(|calls| calls.set(calls.get() + 1));
            }
        });
    }
    unsafe impl GlobalAlloc for Probe {
        unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
            count();
            unsafe { System.alloc(layout) }
        }
        unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
            count();
            unsafe { System.alloc_zeroed(layout) }
        }
        unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, size: usize) -> *mut u8 {
            count();
            unsafe { System.realloc(ptr, layout, size) }
        }
        unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
            count();
            unsafe { System.dealloc(ptr, layout) }
        }
    }
    pub fn measure(f: impl FnOnce()) -> usize {
        CALLS.with(|c| c.set(0));
        ENABLED.with(|c| c.set(true));
        f();
        ENABLED.with(|c| c.set(false));
        CALLS.with(Cell::get)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (rtrb::Producer<AudioFrame>, CallbackKernel) {
        let (p, c) = RingBuffer::new(QUEUE_CAPACITY);
        let control = Arc::new(OutputControl::new());
        control.start(0);
        (
            p,
            CallbackKernel {
                queue: c,
                control,
                stats: Arc::new(Statistics::default()),
                armed_generation: 0,
                pending: None,
                main_channels: [0, 1],
                cue_channels: None,
                cue_gain: 1.0,
            },
        )
    }
    fn sample(l: f32, r: f32, pos: u64) -> AudioFrame {
        AudioFrame {
            left: l,
            right: r,
            cue_left: 0.0,
            cue_right: 0.0,
            position_ms: pos,
            generation: 1,
            finished: false,
            ..Default::default()
        }
    }
    #[test]
    fn a_source_waits_for_a_complete_callback_packet_before_it_is_primed() {
        let (mut p, mut k) = fixture();
        p.push(sample(0.25, 0.25, 1)).unwrap();
        let mut out = [1f32; 8];
        k.fill(&mut out, 2);
        assert_eq!(out, [0.; 8]);
        assert_eq!(k.stats.underrun_frames.load(Ordering::Relaxed), 0);
        for i in 2..=4 {
            p.push(sample(0.25, 0.25, i)).unwrap();
        }
        k.fill(&mut out, 2);
        assert_eq!(out, [0.25; 8]);
        assert_eq!(k.control.position_ms.load(Ordering::Relaxed), 4);
        k.fill(&mut out, 2);
        assert_eq!(k.stats.underrun_frames.load(Ordering::Relaxed), 4);
    }
    #[test]
    fn telemetry_reports_only_callback_consumed_deck_positions_and_meters() {
        let (mut p, mut k) = fixture();
        k.cue_channels = Some([2, 3]);
        k.cue_gain = 0.5;
        p.push(AudioFrame {
            engine_frame: 48,
            deck_positions: [0.001, 3.0],
            deck_mask: 3,
            cue_left: 0.8,
            ..sample(0.2, -0.4, 1)
        })
        .unwrap();
        p.push(AudioFrame {
            engine_frame: 96,
            deck_positions: [0.002, 3.001],
            deck_mask: 3,
            ..sample(0.9, 0.9, 2)
        })
        .unwrap();
        assert!(k.control.snapshot().is_none());
        k.fill(&mut [0f32; 4], 4);
        let status = k.control.snapshot().unwrap();
        assert_eq!(status.engine_frame, 48);
        assert_eq!(status.deck_positions, [0.001, 3.0]);
        assert_eq!(status.main_peak, 0.4);
        assert_eq!(status.cue_peak, 0.4);
    }
    #[test]
    fn seek_invalidates_old_telemetry_until_new_generation_is_consumed() {
        let (mut p, mut k) = fixture();
        p.push(sample(0.2, 0.2, 5)).unwrap();
        k.fill(&mut [0f32; 2], 2);
        assert!(k.control.snapshot().is_some());
        k.control.advance();
        assert!(k.control.snapshot().is_none());
    }
    #[test]
    fn telemetry_snapshot_never_mixes_concurrent_clock_and_deck_updates() {
        let telemetry = Arc::new(Telemetry::default());
        let writer = telemetry.clone();
        let worker = std::thread::spawn(move || {
            for clock in 1..20000 {
                writer.publish(PerformanceSnapshot {
                    engine_frame: clock,
                    deck_positions: [clock as f64, clock as f64 * 2.0],
                    ..Default::default()
                });
            }
        });
        for _ in 0..20000 {
            if let Some(s) = telemetry.read() {
                assert_eq!(
                    s.deck_positions,
                    [s.engine_frame as f64, s.engine_frame as f64 * 2.0]
                );
            }
        }
        worker.join().unwrap();
    }
    #[test]
    fn queue_adapts_when_the_driver_ignores_requested_buffer_size() {
        assert_eq!(queue_target(64, 480), 960);
        assert_eq!(queue_target(128, 128), 256);
        assert_eq!(queue_target(2048, 8192), 4096);
    }
    #[test]
    fn callback_does_not_allocate_or_free_heap_memory() {
        let (mut p, mut k) = fixture();
        for i in 0..1024 {
            p.push(sample(0.2, -0.1, i)).unwrap();
        }
        let mut out = [0f32; 512];
        let calls = super::allocation_probe::measure(|| {
            for _ in 0..5 {
                k.fill(&mut out, 2);
            }
            k.control.advance();
            k.fill(&mut out, 2);
            k.control.stop();
            k.fill(&mut out, 2);
        });
        assert_eq!(calls, 0);
    }
    #[test]
    fn cue_is_independent_of_main_and_uses_selected_pair() {
        let (mut p, mut k) = fixture();
        k.main_channels = [2, 3];
        k.cue_channels = Some([0, 1]);
        k.cue_gain = 0.5;
        p.push(AudioFrame {
            cue_left: 0.8,
            cue_right: -0.6,
            ..sample(0.0, 0.0, 1)
        })
        .unwrap();
        let mut out = [0f32; 6];
        k.fill(&mut out, 6);
        assert_eq!(out, [0.4, -0.3, 0., 0., 0., 0.]);
    }
    #[test]
    fn cue_cannot_share_main_channels() {
        assert!(OutputSettings {
            cue_channels: Some([1, 2]),
            ..Default::default()
        }
        .validate()
        .is_err());
        assert!(OutputSettings {
            cue_channels: Some([2, 3]),
            ..Default::default()
        }
        .validate()
        .is_ok());
    }
    #[test]
    fn callback_routes_stereo_and_zeroes_extra_channels() {
        let (mut p, mut k) = fixture();
        p.push(sample(0.25, -0.5, 4)).unwrap();
        let mut out = [1f32; 8];
        k.fill(&mut out, 8);
        assert_eq!(out, [0.25, -0.5, 0., 0., 0., 0., 0., 0.]);
        assert_eq!(k.control.position_ms.load(Ordering::Relaxed), 4);
    }
    #[test]
    fn callback_downmixes_mono_and_converts_integer_format() {
        let (mut p, mut k) = fixture();
        p.push(sample(0.5, 0.5, 1)).unwrap();
        let mut out = [0i16; 1];
        k.fill(&mut out, 1);
        assert!((out[0] as i32 - 16384).abs() <= 1);
    }
    #[test]
    fn stale_frames_are_discarded_after_seek() {
        let (mut p, mut k) = fixture();
        p.push(sample(0.8, 0.8, 1)).unwrap();
        k.control.advance();
        p.push(AudioFrame {
            generation: 2,
            ..sample(0.2, 0.3, 50)
        })
        .unwrap();
        let mut out = [0f32; 2];
        k.fill(&mut out, 2);
        assert_eq!(out, [0.2, 0.3]);
        assert_eq!(k.control.position_ms.load(Ordering::Relaxed), 50);
    }
    #[test]
    fn stop_is_silent_even_with_queued_audio() {
        let (mut p, mut k) = fixture();
        p.push(sample(0.8, 0.8, 1)).unwrap();
        k.control.stop();
        let mut out = [1.; 2];
        k.fill(&mut out, 2);
        assert_eq!(out, [0., 0.]);
        assert_eq!(k.control.position_ms.load(Ordering::Relaxed), 0);
    }
    #[test]
    fn underruns_are_counted_after_playback_is_primed() {
        let (mut p, mut k) = fixture();
        let mut out = [0f32; 2];
        k.fill(&mut out, 2);
        assert_eq!(k.stats.underrun_frames.load(Ordering::Relaxed), 0);
        p.push(sample(0.2, 0.2, 1)).unwrap();
        k.fill(&mut out, 2);
        k.fill(&mut out, 2);
        assert_eq!(k.stats.underrun_frames.load(Ordering::Relaxed), 1);
    }
    #[test]
    fn terminal_frame_cannot_finish_a_new_play_request() {
        let (mut p, mut k) = fixture();
        p.push(AudioFrame {
            finished: true,
            ..sample(0.2, 0.2, 1)
        })
        .unwrap();
        let mut out = [0f32; 2];
        k.fill(&mut out, 2);
        assert!(!k.control.is_playing());
        k.control.advance();
        k.control.start(0);
        assert!(k.control.is_playing());
    }
    #[test]
    fn invalid_samples_are_silenced_and_headroom_is_counted() {
        let (mut p, mut k) = fixture();
        p.push(sample(f32::NAN, 1.5, 1)).unwrap();
        let mut out = [0f32; 2];
        k.fill(&mut out, 2);
        assert_eq!(out, [0., 1.]);
        assert_eq!(k.stats.invalid_samples.load(Ordering::Relaxed), 1);
        assert_eq!(k.stats.clipped_samples.load(Ordering::Relaxed), 1);
    }
    #[test]
    fn settings_reject_unbounded_or_non_power_of_two_buffers() {
        assert!(OutputSettings {
            buffer_frames: 63,
            ..Default::default()
        }
        .validate()
        .is_err());
        assert!(OutputSettings {
            buffer_frames: 8192,
            ..Default::default()
        }
        .validate()
        .is_err());
        assert!(OutputSettings {
            buffer_frames: 128,
            ..Default::default()
        }
        .validate()
        .is_ok());
    }
}
