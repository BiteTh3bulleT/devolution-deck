//! Waveform peak computation from audio files via Symphonia.

use serde::{Deserialize, Serialize};
use std::fs::File;
use std::path::Path;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

/// Peak data for one bucket (e.g. one pixel column). Min/max for stereo is combined.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WaveformBucket {
    pub min: f32,
    pub max: f32,
}

/// Result of waveform computation: list of buckets for drawing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WaveformPeaks {
    pub sample_rate: u32,
    pub duration_secs: f64,
    pub channels: u16,
    pub buckets: Vec<WaveformBucket>,
}

/// Compute waveform peak buckets for an audio file. Returns min/max per bucket
/// for efficient drawing. `num_buckets` is typically the display width in pixels.
pub fn compute_waveform_peaks(path: &Path, num_buckets: usize) -> Result<WaveformPeaks, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let format_opts = FormatOptions::default();
    let metadata_opts = MetadataOptions::default();
    let hint = Hint::new();
    let probe = symphonia::default::get_probe();
    let mut format_reader = probe
        .format(&hint, mss, &format_opts, &metadata_opts)
        .map_err(|e| e.to_string())?
        .format;

    let track = format_reader
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != symphonia::core::codecs::CODEC_TYPE_NULL)
        .ok_or("No audio track")?;

    let track_id = track.id;
    let sample_rate = track
        .codec_params
        .sample_rate
        .ok_or("Missing sample rate")?;
    let channels = track
        .codec_params
        .channels
        .ok_or("Missing channel count")?
        .count() as usize;

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| e.to_string())?;

    let mut total_samples: usize = 0;
    let mut all_samples: Vec<f32> = Vec::new();

    while let Ok(packet) = format_reader.next_packet() {
        if packet.track_id() != track_id {
            continue;
        }
        match decoder.decode(&packet) {
            Ok(decoded) => {
                let spec = *decoded.spec();
                let duration = decoded.frames();
                let mut buf = SampleBuffer::<f32>::new(duration as u64, spec);
                buf.copy_interleaved_ref(decoded);
                let samples = buf.samples();
                total_samples += samples.len();
                for &s in samples {
                    all_samples.push(s);
                }
            }
            Err(_) => continue,
        }
    }

    let duration_secs = total_samples as f64 / (sample_rate as f64 * channels as f64);
    let channels_u16 = channels as u16;
    if duration_secs <= 0.0 || all_samples.is_empty() {
        return Ok(WaveformPeaks {
            sample_rate,
            duration_secs: 0.0,
            channels: channels_u16,
            buckets: vec![],
        });
    }

    let samples_per_bucket = (all_samples.len() / channels).max(1) / num_buckets.max(1);
    let mut buckets = Vec::with_capacity(num_buckets);

    for i in 0..num_buckets {
        let start = (i * samples_per_bucket * channels).min(all_samples.len());
        let end = ((i + 1) * samples_per_bucket * channels).min(all_samples.len());
        if start >= end {
            buckets.push(WaveformBucket { min: 0.0, max: 0.0 });
            continue;
        }
        let slice = &all_samples[start..end];
        let min = slice.iter().copied().fold(f32::INFINITY, f32::min);
        let max = slice.iter().copied().fold(f32::NEG_INFINITY, f32::max);
        buckets.push(WaveformBucket { min, max });
    }

    Ok(WaveformPeaks {
        sample_rate,
        duration_secs,
        channels: channels_u16,
        buckets,
    })
}
