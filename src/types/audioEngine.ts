export interface OutputSettings {
  device_name: string | null; sample_rate: number | null; buffer_frames: number;
  main_channels: [number, number]; cue_channels: [number, number] | null; cue_gain_db: number;
}
export interface OutputDiagnostics {
  settings: OutputSettings; host: string; device_name: string | null;
  sample_rate: number; engine_sample_rate: number; channels: number; sample_format: string;
  fixed_device_buffer: number | null; observed_callback_frames: number;
  software_queue_target_frames: number; queued_frames: number; callbacks: number;
  underrun_frames: number; underrun_callbacks: number; invalid_samples: number; clipped_samples: number;
  callback_max_us: number; callback_average_us: number; callback_load_percent: number;
  estimated_output_latency_ms: number | null; error: string | null;
}
