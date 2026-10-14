/// Five-millisecond velocity transitions retain the source cursor and DSP history.
#[derive(Clone, Copy, Default)]
pub(super) struct SpeedRamp {
    value: f64,
    target: f64,
    step: f64,
    left: u32,
}
impl SpeedRamp {
    pub fn reset(&mut self, value: f64) {
        self.value = value;
        self.target = value;
        self.left = 0;
    }
    pub fn target(&mut self, target: f64) {
        if self.target != target {
            self.target = target;
            self.left = 240;
            self.step = (target - self.value) / 240.0;
        }
    }
    pub fn next(&mut self) -> f64 {
        if self.left > 0 {
            self.value += self.step;
            self.left -= 1;
        } else {
            self.value = self.target;
        }
        self.value
    }
}
