//! Meters derived from the actual buffers the playback engine is rendering.

/// Peak absolute sample value in the window ending at `position_secs`.
/// Returns 0.0 when the window falls entirely outside the buffer.
pub fn peak_in_window(
    samples: &[f32],
    sample_rate: u32,
    position_secs: f64,
    window_secs: f64,
) -> f32 {
    let sample_rate = sample_rate.max(1);
    let end = ((position_secs.max(0.0)) * sample_rate as f64).round() as usize;
    let window = ((window_secs.max(0.0)) * sample_rate as f64).round() as usize;
    let start = end.saturating_sub(window.max(1));
    if start >= samples.len() {
        return 0.0;
    }
    let end = end.min(samples.len());
    samples[start..end]
        .iter()
        .fold(0.0f32, |peak, sample| peak.max(sample.abs()))
}

#[cfg(test)]
mod tests {
    use super::peak_in_window;

    #[test]
    fn reports_peak_of_window_ending_at_position() {
        let samples = vec![0.1, -0.8, 0.2, 0.3, -0.4, 0.05];
        // 2 Hz buffer: window of 1s ending at 2s covers samples[2..4].
        let peak = peak_in_window(&samples, 2, 2.0, 1.0);
        assert!((peak - 0.3).abs() < f32::EPSILON);
    }

    #[test]
    fn returns_zero_outside_buffer() {
        let samples = vec![0.5, 0.5];
        assert_eq!(peak_in_window(&samples, 2, 10.0, 0.5), 0.0);
        assert_eq!(peak_in_window(&[], 2, 0.5, 0.5), 0.0);
    }
}
