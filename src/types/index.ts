/**
 * Domain types aligned with Rust backend models.
 * Used by stores and UI.
 */

export interface MediaAsset {
  id: string;
  name: string;
  path: string;
  duration_secs: number;
  sample_rate: number;
  channels: number;
}

export interface TimelineClip {
  id: string;
  media_asset_id: string;
  start_secs: number;
  source_offset_secs: number;
  duration_secs: number;
}

export interface Track {
  id: string;
  name: string;
  index: number;
  clips: TimelineClip[];
}

export interface Project {
  version: number;
  title: string;
  bpm: number;
  sample_rate: number;
  media: MediaAsset[];
  tracks: Track[];
}

export interface WaveformBucket {
  min: number;
  max: number;
}

export interface WaveformPeaks {
  sample_rate: number;
  duration_secs: number;
  buckets: WaveformBucket[];
}
