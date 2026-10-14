//! Stereo-linked waveform similarity overlap-add, preserving pitch while changing duration.
use super::render::StereoSource;
pub(crate) fn stretch_stereo(source: &StereoSource, ratio: f64) -> StereoSource {
    let n = source.left.len().min(source.right.len());
    if n == 0 || (ratio - 1.0).abs() < 1e-6 {
        return source.clone();
    }
    let length = (n as f64 * ratio.clamp(0.25, 4.0)).round() as usize;
    let window = 1024.min(n);
    let hop = (window / 2).max(1);
    let (mut left, mut right, mut weights) =
        (vec![0.0; length], vec![0.0; length], vec![0.0f32; length]);
    let mut prior = None;
    for destination in (0..length).step_by(hop) {
        let expected = (destination as f64 / ratio).round() as usize;
        let mut selected = expected.min(n.saturating_sub(window));
        if let Some(previous) = prior {
            let begin = selected.saturating_sub(128);
            let end = (selected + 128).min(n.saturating_sub(window));
            let mut best = f64::NEG_INFINITY;
            for candidate in (begin..=end).step_by(8) {
                let mut correlation = 0.0;
                let (mut ea, mut eb) = (1e-12, 1e-12);
                for j in (0..hop).step_by(8) {
                    let a = previous + hop + j;
                    if a >= n || candidate + j >= n {
                        break;
                    }
                    let x = (source.left[a] + source.right[a]) as f64;
                    let y = (source.left[candidate + j] + source.right[candidate + j]) as f64;
                    correlation += x * y;
                    ea += x * x;
                    eb += y * y;
                }
                let score = correlation / (ea * eb).sqrt()
                    - ((candidate as f64 - expected as f64).abs() / 1024.0) * 0.001;
                if score > best {
                    best = score;
                    selected = candidate;
                }
            }
        }
        for j in 0..window {
            if destination + j >= length || selected + j >= n {
                break;
            }
            let w = (0.5
                - 0.5 * (2.0 * std::f64::consts::PI * (j as f64 + 0.5) / window as f64).cos())
                as f32;
            left[destination + j] += source.left[selected + j] * w;
            right[destination + j] += source.right[selected + j] * w;
            weights[destination + j] += w;
        }
        prior = Some(selected);
    }
    for i in 0..length {
        if weights[i] > 1e-8 {
            left[i] /= weights[i];
            right[i] /= weights[i];
        }
    }
    StereoSource { left, right }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stretch_changes_length_without_octave_shift() {
        let rate = 48000.0;
        let samples: Vec<_> = (0..48000)
            .map(|i| (2.0 * std::f64::consts::PI * 440.0 * i as f64 / rate).sin() as f32)
            .collect();
        let s = stretch_stereo(
            &StereoSource {
                left: samples.clone(),
                right: samples,
            },
            2.0,
        );
        assert_eq!(s.left.len(), 96000);
        let crossings = s.left[4800..91200]
            .windows(2)
            .filter(|v| v[0] <= 0.0 && v[1] > 0.0)
            .count();
        let frequency = crossings as f64 / (86400.0 / rate);
        assert!((frequency - 440.0).abs() < 5.0, "frequency={frequency}");
        assert_eq!(s.left, s.right);
    }
}
