//! Persistent per-deck DSP on the producer thread, before main/cue routing.
const RAMP_FRAMES: u32 = 960; // 20 ms at the internal 48 kHz rate.
#[derive(Clone, Copy, Default)]
struct Ramp {
    value: f32,
    target: f32,
    step: f32,
    remaining: u32,
}
impl Ramp {
    fn target(&mut self, target: f32) {
        if self.target != target {
            self.target = target;
            self.remaining = RAMP_FRAMES;
            self.step = (target - self.value) / RAMP_FRAMES as f32;
        }
    }
    fn next(&mut self) -> f32 {
        if self.remaining > 0 {
            self.value += self.step;
            self.remaining -= 1;
        }
        if self.remaining == 0 {
            self.value = self.target;
        }
        self.value
    }
}
#[derive(Clone, Copy, Default)]
pub(crate) struct DeckDsp {
    gain: Ramp,
    cue: Ramp,
    amount: Ramp,
    lp_alpha: Ramp,
    hp_alpha: Ramp,
    low: [f32; 2],
    high_low: [f32; 2],
}
impl DeckDsp {
    pub fn target(&mut self, gain: f32, cue: f32, filter: f32) {
        self.gain.target(gain);
        self.cue.target(cue);
        let amount = filter.clamp(-1.0, 1.0);
        self.amount.target(amount);
        let lp_hz = 20_000.0f32 * (80.0f32 / 20_000.0).powf((-amount).max(0.0));
        let hp_hz = 30.0f32 * (15_000.0f32 / 30.0).powf(amount.max(0.0));
        let alpha = |hz: f32| 1.0 - (-std::f32::consts::TAU * hz / 48_000.0).exp();
        self.lp_alpha.target(alpha(lp_hz));
        self.hp_alpha.target(alpha(hp_hz));
    }
    pub fn process(&mut self, input: [f32; 2]) -> ([f32; 2], [f32; 2]) {
        let gain = self.gain.next();
        let cue = self.cue.next();
        let amount = self.amount.next();
        let lp = self.lp_alpha.next();
        let hp = self.hp_alpha.next();
        let blend = (amount.abs() * 12.0).min(1.0);
        let mut main = [0.0; 2];
        let mut monitor = [0.0; 2];
        for channel in 0..2 {
            let sample = if input[channel].is_finite() {
                input[channel]
            } else {
                0.0
            };
            self.low[channel] += lp * (sample - self.low[channel]);
            self.high_low[channel] += hp * (sample - self.high_low[channel]);
            let filtered = if amount < 0.0 {
                self.low[channel]
            } else {
                sample - self.high_low[channel]
            };
            let output = sample + blend * (filtered - sample);
            main[channel] = output * gain;
            monitor[channel] = output * cue;
        }
        (main, monitor)
    }
}

/// Compute a boundary from the master's next unrendered source sample.
pub(crate) fn beat_delay_frames(
    position: f64,
    speed: f64,
    source_bpm: f64,
    beats: u32,
) -> Result<u64, String> {
    if !position.is_finite()
        || position < 0.0
        || !speed.is_finite()
        || speed <= 0.0
        || !source_bpm.is_finite()
        || !(20.0..=400.0).contains(&source_bpm)
        || !(1..=16).contains(&beats)
    {
        return Err("Invalid master beat grid".into());
    }
    let beat = position * source_bpm / 60.0;
    let boundary = ((beat / beats as f64) - 1e-10).ceil() * beats as f64;
    Ok(
        (((boundary - beat).max(0.0) * 60.0 / source_bpm / speed * 48_000.0) - 1e-7)
            .ceil()
            .max(0.0) as u64,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn gain_ramp_reaches_target_without_an_instant_step() {
        let mut dsp = DeckDsp::default();
        dsp.target(1.0, 0.5, 0.0);
        let first = dsp.process([1.0, 1.0]);
        assert!(first.0[0] > 0.0 && first.0[0] < 0.01);
        for _ in 1..960 {
            dsp.process([1.0, 1.0]);
        }
        assert_eq!(dsp.process([1.0, 1.0]), ([1.0, 1.0], [0.5, 0.5]));
        dsp.target(0.0, 0.0, 0.0);
        assert!(dsp.process([1.0, 1.0]).0[0] > 0.99);
    }
    fn energy(frequency: f32, filter: f32) -> f32 {
        let mut dsp = DeckDsp::default();
        dsp.target(1.0, 1.0, filter);
        let mut sum = 0.0;
        for i in 0..48000 {
            let input = (std::f32::consts::TAU * frequency * i as f32 / 48000.0).sin();
            let (main, cue) = dsp.process([input, input]);
            assert_eq!(main, cue);
            if i > 24000 {
                sum += main[0] * main[0];
            }
        }
        sum
    }
    #[test]
    fn low_pass_attenuates_high_frequencies() {
        assert!(energy(4000.0, -1.0) < energy(40.0, -1.0) * 0.02);
    }
    #[test]
    fn high_pass_attenuates_low_frequencies() {
        assert!(energy(40.0, 0.5) < energy(4000.0, 0.5) * 0.02);
    }
    #[test]
    fn neutral_filter_is_exact_bypass_after_ramp() {
        assert!((energy(1000.0, 0.0) - 12000.0).abs() < 10.0);
    }
    #[test]
    fn beat_and_bar_boundaries_use_source_grid_and_speed() {
        assert_eq!(beat_delay_frames(0.25, 1.0, 120.0, 1).unwrap(), 12000);
        assert_eq!(beat_delay_frames(0.5, 1.0, 120.0, 1).unwrap(), 0);
        assert_eq!(beat_delay_frames(0.25, 2.0, 120.0, 4).unwrap(), 42000);
    }
    #[test]
    fn invalid_grid_is_rejected() {
        assert!(beat_delay_frames(0.0, 0.0, 120.0, 1).is_err());
        assert!(beat_delay_frames(0.0, 1.0, f64::NAN, 1).is_err());
    }
}
