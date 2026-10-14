export interface AudioAnalysis {
  sample_rate: number; duration_secs: number; peak_dbfs: number; rms_dbfs: number; crest_db: number;
  integrated_lufs: number | null; dc_left: number; dc_right: number; stereo_correlation: number;
  clipped_samples: number; silence_secs: number; transient_secs: number[];
  waveform: { left_min: number; left_max: number; right_min: number; right_max: number }[];
  spectrum: { frequency_hz: number; dbfs: number }[];
}
export interface ProcessSettings {
  start_secs: number; end_secs: number | null; gain_db: number; normalize_dbfs: number | null;
  reverse: boolean; mono: boolean; invert_left: boolean; invert_right: boolean;
  fade_in_ms: number; fade_out_ms: number; highpass_hz: number | null; lowpass_hz: number | null;
  compressor_threshold_db: number | null; compressor_ratio: number; limiter_ceiling_dbfs: number | null;
  output_sample_rate: number | null; stretch_ratio: number;
}
export interface SignalSettings {
  kind: "sine" | "square" | "triangle" | "white" | "pink" | "sweep" | "impulse";
  duration_secs: number; frequency_hz: number; end_frequency_hz: number; level_dbfs: number; sample_rate: number;
}
export interface LabDevice { name: string; direction: "input" | "output"; is_default: boolean; sample_rates: number[]; channels: number[]; formats: string[] }
export interface LabResult { path: string; analysis: AudioAnalysis }
export const DEFAULT_PROCESS: ProcessSettings = {
  start_secs: 0, end_secs: null, gain_db: 0, normalize_dbfs: null, reverse: false, mono: false,
  invert_left: false, invert_right: false, fade_in_ms: 0, fade_out_ms: 0,
  highpass_hz: null, lowpass_hz: null, compressor_threshold_db: null, compressor_ratio: 4,
  limiter_ceiling_dbfs: null, output_sample_rate: null, stretch_ratio: 1,
};
