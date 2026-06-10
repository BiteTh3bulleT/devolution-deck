//! Meters derived from the actual buffers the playback engine is rendering.

/// Peak absolute sample value across all channels in the window ending at
/// `position_secs`. `samples` is interleaved with `channels` per frame.
/// Returns 0.0 when the window falls entirely outside the buffer.
pub fn peak_in_window(
    samples: &[f32],
    sample_rate: u32,
    channels: u16,
    position_secs: f64,
    window_secs: f64,
) -> f32 {
    let sample_rate = sample_rate.max(1);
    let channels = channels.max(1) as usize;
    let end_frame = ((position_secs.max(0.0)) * sample_rate as f64).round() as usize;
    let window_frames = ((window_secs.max(0.0)) * sample_rate as f64).round() as usize;
    let start_frame = end_frame.saturating_sub(window_frames.max(1));
    let total_frames = samples.len() / channels;
    if start_frame >= total_frames {
        return 0.0;
    }
    let end_frame = end_frame.min(total_frames);
    samples[start_frame * channels..end_frame * channels]
        .iter()
        .fold(0.0f32, |peak, sample| peak.max(sample.abs()))
}

#[cfg(test)]
mod tests {
    use super::peak_in_window;

    #[test]
    fn reports_peak_of_window_ending_at_position() {
        let samples = vec![0.1, -0.8, 0.2, 0.3, -0.4, 0.05];
        // 2 Hz mono buffer: window of 1s ending at 2s covers samples[2..4].
        let peak = peak_in_window(&samples, 2, 1, 2.0, 1.0);
        assert!((peak - 0.3).abs() < f32::EPSILON);
    }

    #[test]
    fn returns_zero_outside_buffer() {
        let samples = vec![0.5, 0.5];
        assert_eq!(peak_in_window(&samples, 2, 1, 10.0, 0.5), 0.0);
        assert_eq!(peak_in_window(&[], 2, 1, 0.5, 0.5), 0.0);
    }

    #[test]
    fn scans_all_channels_of_interleaved_frames() {
        // 2 Hz stereo: frames are [L0 R0 L1 R1]; window 1s ending at 2s = frames 2..4? buffer has 2 frames.
        let samples = vec![0.1, -0.9, 0.2, 0.3];
        let peak = peak_in_window(&samples, 2, 2, 1.0, 1.0);
        assert!((peak - 0.9).abs() < f32::EPSILON);
    }
}
