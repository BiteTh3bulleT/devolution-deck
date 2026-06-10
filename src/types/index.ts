/**
 * Domain types aligned with Rust backend models.
 * Phase 3 — session launcher, scenes, automation, routing, warp, slicing, browser index, templates.
 */

// ---------------------------------------------------------------------------
// Audio / waveform
// ---------------------------------------------------------------------------

export interface MediaAsset {
  id: string;
  name: string;
  path: string;
  duration_secs: number;
  sample_rate: number;
  channels: number;
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

// ---------------------------------------------------------------------------
// MIDI
// ---------------------------------------------------------------------------

/** Ticks per beat. Matches Rust TICKS_PER_BEAT = 480. */
export const TICKS_PER_BEAT = 480;

export type QuantizeDivision = "1/1" | "1/2" | "1/4" | "1/8" | "1/16" | "1/32";

export const QUANTIZE_DIVISIONS: QuantizeDivision[] = [
  "1/1",
  "1/2",
  "1/4",
  "1/8",
  "1/16",
  "1/32",
];

export const DIVISION_TICKS: Record<QuantizeDivision, number> = {
  "1/1": TICKS_PER_BEAT * 4,
  "1/2": TICKS_PER_BEAT * 2,
  "1/4": TICKS_PER_BEAT,
  "1/8": TICKS_PER_BEAT / 2,
  "1/16": TICKS_PER_BEAT / 4,
  "1/32": TICKS_PER_BEAT / 8,
};

export function snapTicks(ticks: number, division: QuantizeDivision): number {
  const grid = DIVISION_TICKS[division];
  return Math.max(0, Math.round(ticks / grid) * grid);
}

export interface MidiNote {
  id: string;
  pitch: number;
  start_ticks: number;
  duration_ticks: number;
  velocity: number;
}

export interface MidiClip {
  id: string;
  start_secs: number;
  duration_secs: number;
  notes: MidiNote[];
  loop_clip: boolean;
}

// ---------------------------------------------------------------------------
// Warp / slicing
// ---------------------------------------------------------------------------

export interface WarpState {
  enabled: boolean;
  source_bpm?: number;
  target_bpm?: number;
  algorithm: string;
  preserve_formants: boolean;
}

export interface SliceMarker {
  id: string;
  time_secs: number;
  transient_strength: number;
  label?: string;
}

// ---------------------------------------------------------------------------
// Arrangement clips
// ---------------------------------------------------------------------------

export interface TimelineClip {
  id: string;
  media_asset_id: string;
  start_secs: number;
  source_offset_secs: number;
  duration_secs: number;
  warp?: WarpState;
  slice_markers: SliceMarker[];
}

// ---------------------------------------------------------------------------
// Session launcher
// ---------------------------------------------------------------------------

export interface Scene {
  id: string;
  name: string;
  color: string;
  index: number;
  launch_quantize_beats: number;
}

export type SessionClipSource =
  | {
      kind: "audio";
      media_asset_id: string;
      source_offset_secs: number;
    }
  | {
      kind: "midi";
      notes: MidiNote[];
    };

export interface SessionClip {
  id: string;
  track_id: string;
  scene_id: string;
  name: string;
  source: SessionClipSource;
  length_secs: number;
  gain_db: number;
  muted: boolean;
  warp?: WarpState;
  slices: SliceMarker[];
}

export interface SessionState {
  scenes: Scene[];
  clips: SessionClip[];
  launch_quantize_beats: number;
  active_scene_id?: string;
}

// ---------------------------------------------------------------------------
// Automation
// ---------------------------------------------------------------------------

export interface AutomationPoint {
  id: string;
  time_secs: number;
  value: number;
  curve: number;
}

export interface AutomationLane {
  id: string;
  track_id: string;
  parameter: string;
  enabled: boolean;
  points: AutomationPoint[];
}

// ---------------------------------------------------------------------------
// Routing / mixer
// ---------------------------------------------------------------------------

export interface SendRoute {
  id: string;
  from_track_id: string;
  to_return_id: string;
  amount: number;
  pre_fader: boolean;
  enabled: boolean;
}

export interface ReturnTrack {
  id: string;
  name: string;
  index: number;
  gain_db: number;
  muted: boolean;
}

export interface BusTrack {
  id: string;
  name: string;
  member_track_ids: string[];
  gain_db: number;
  muted: boolean;
  solo: boolean;
}

export interface RoutingState {
  returns: ReturnTrack[];
  buses: BusTrack[];
  sends: SendRoute[];
}

// ---------------------------------------------------------------------------
// Browser index / tags
// ---------------------------------------------------------------------------

export interface BrowserTag {
  id: string;
  label: string;
  color?: string;
}

export interface BrowserAssetIndexEntry {
  asset_id: string;
  tag_ids: string[];
  favorite: boolean;
  last_used_unix_ms?: number;
}

export interface BrowserIndexState {
  tags: BrowserTag[];
  assets: BrowserAssetIndexEntry[];
  selected_tag_ids: string[];
  search_query: string;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export interface TemplateTrack {
  name: string;
  role: string;
  track_type: TrackType;
}

export interface TemplateDefinition {
  id: string;
  name: string;
  genre: string;
  description: string;
  bpm: number;
  tracks: TemplateTrack[];
}

// ---------------------------------------------------------------------------
// Phase 4: Plugins / routing / render / recovery / shortcuts
// ---------------------------------------------------------------------------

export interface PluginDescriptor {
  id: string;
  name: string;
  vendor: string;
  version: string;
  format: string;
  bundle_path: string;
  binary_path: string;
  factory_symbol_found: boolean;
}

export interface PluginParameterState {
  id: string;
  value: number;
}

export interface PluginInstance {
  id: string;
  descriptor_id: string;
  enabled: boolean;
  bypassed: boolean;
  order: number;
  parameters: PluginParameterState[];
  serialized_state_b64?: string;
}

export interface PluginChain {
  instances: PluginInstance[];
}

export interface SidechainRoute {
  id: string;
  from_track_id: string;
  to_track_id: string;
  target_plugin_instance_id?: string;
  amount: number;
  enabled: boolean;
}

export interface FreezeState {
  is_frozen: boolean;
  frozen_asset_id?: string;
  frozen_path?: string;
  original_clips: TimelineClip[];
  original_midi_clips: MidiClip[];
}

export interface RenderJob {
  id: string;
  kind: string;
  status: string;
  output_dir: string;
  output_files: string[];
  created_unix_ms: number;
  completed_unix_ms?: number;
}

export interface StemExportConfig {
  output_dir: string;
  include_muted: boolean;
  skip_silent_tracks: boolean;
  filename_prefix?: string;
}

export interface TakeClip {
  id: string;
  media_asset_id: string;
  start_secs: number;
  source_offset_secs: number;
  duration_secs: number;
}

export interface TakeLane {
  id: string;
  name: string;
  muted: boolean;
  clips: TakeClip[];
}

export interface CompRegion {
  id: string;
  lane_id: string;
  take_clip_id: string;
  start_secs: number;
  end_secs: number;
  fade_secs: number;
}

export interface RecoverySnapshot {
  id: string;
  path: string;
  created_unix_ms: number;
  reason: string;
}

export interface ShortcutBinding {
  id: string;
  action_id: string;
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  enabled: boolean;
}

export interface MonitoringState {
  input_monitoring_enabled: boolean;
  direct_monitoring_preferred: boolean;
  target_buffer_ms: number;
  latency_compensation_ms: number;
}

// ---------------------------------------------------------------------------
// Phase 8: App flow / ops / diagnostics / release readiness
// ---------------------------------------------------------------------------

export type AppMode = "studio" | "deck" | "show" | "hybrid";

export interface NavigationState {
  active_mode: AppMode;
  main_view: string;
  utility_tab: string;
  focus_track_id?: string;
  last_route_unix_ms?: number;
}

export interface UserPreferences {
  startup_mode: AppMode;
  open_last_project_on_launch: boolean;
  auto_analyze_library: boolean;
  low_light_boost: boolean;
  reduce_motion: boolean;
  show_tooltips: boolean;
  metronome_default_enabled: boolean;
  ui_scale: number;
  preferred_audio_input_device?: string;
  preferred_audio_output_device?: string;
}

export interface DeviceProfile {
  id: string;
  name: string;
  device_type: string;
  connected: boolean;
  latency_ms?: number;
  sample_rate?: number;
  channels?: number;
  last_seen_unix_ms?: number;
  details?: string;
}

export interface DeviceDiagnosticState {
  last_run_unix_ms?: number;
  audio_input_devices: string[];
  warnings: string[];
  errors: string[];
  midi_binding_count: number;
  osc_binding_count: number;
  dmx_universe_count: number;
  healthy: boolean;
}

export interface CompatibilityReport {
  id: string;
  created_unix_ms: number;
  schema_version: number;
  compatible: boolean;
  warnings: string[];
  required_migrations: string[];
  missing_assets: string[];
}

export interface MigrationStep {
  id: string;
  description: string;
  applied: boolean;
  error?: string;
}

export interface MigrationPlan {
  id: string;
  created_unix_ms: number;
  source_version: number;
  target_version: number;
  backup_path?: string;
  steps: MigrationStep[];
  applied: boolean;
}

export interface MissingMediaAsset {
  asset_id: string;
  name: string;
  path: string;
  filename: string;
}

export interface MediaRelinkResult {
  asset_id: string;
  old_path: string;
  new_path?: string;
  candidate_count: number;
  relinked: boolean;
}

export interface PluginChainIssue {
  track_id: string;
  track_name: string;
  instance_id: string;
  descriptor_id: string;
  severity: string;
  message: string;
}

export interface RecoveryAction {
  id: string;
  name: string;
  description: string;
  command_id: string;
  recommended: boolean;
}

export interface ErrorReport {
  id: string;
  source: string;
  message: string;
  severity: string;
  created_unix_ms: number;
  context?: string;
  recovery_actions: RecoveryAction[];
  acknowledged: boolean;
  dispatched_unix_ms?: number;
  dispatch_attempts: number;
}

export interface SupportBundle {
  id: string;
  path: string;
  created_unix_ms: number;
  include_logs: boolean;
  include_project_state: boolean;
  include_device_state: boolean;
  status: string;
}

export interface PerformanceProfile {
  captured_unix_ms?: number;
  startup_ms: number;
  ui_frame_budget_ms: number;
  audio_buffer_ms: number;
  project_track_count: number;
  project_clip_count: number;
  show_event_queue_depth: number;
  recommendation: string;
}

export interface ReleaseConfig {
  channel: string;
  target_platforms: string[];
  code_signing_ready: boolean;
  crash_reporting_enabled: boolean;
  crash_report_endpoint?: string;
  diagnostics_retention_days: number;
  build_number: number;
}

export interface ReleaseReadinessCheck {
  id: string;
  created_unix_ms: number;
  ready: boolean;
  blockers: string[];
  warnings: string[];
}

export interface StatusIndicatorState {
  id: string;
  label: string;
  level: string;
  detail: string;
  updated_unix_ms?: number;
}

export interface OnboardingStep {
  id: string;
  title: string;
  completed: boolean;
  action_id: string;
}

export interface OnboardingState {
  completed: boolean;
  dismissed: boolean;
  current_step_index: number;
  steps: OnboardingStep[];
  last_opened_unix_ms?: number;
}

export interface SystemHealthSnapshot {
  captured_unix_ms?: number;
  transport_ready: boolean;
  audio_ready: boolean;
  show_ready: boolean;
  device_health_score: number;
  pending_errors: number;
  recent_warning_count: number;
  status_indicators: StatusIndicatorState[];
}

// ---------------------------------------------------------------------------
// Phase 5: AI assistant / dashboard / performance / branding
// ---------------------------------------------------------------------------

export interface ChordSuggestion {
  id: string;
  key_root: string;
  scale: string;
  chord: string;
  roman: string;
  start_bar: number;
  duration_bars: number;
  confidence: number;
  tension: number;
}

export interface ProgressionSuggestion {
  id: string;
  name: string;
  mood: string;
  bars: number;
  chords: string[];
  confidence: number;
}

export interface HarmonySuggestionPack {
  chords: ChordSuggestion[];
  progressions: ProgressionSuggestion[];
}

export interface AssetClassification {
  asset_id: string;
  category: string;
  sub_category?: string;
  confidence: number;
  is_loop: boolean;
  estimated_bpm?: number;
  energy: number;
  suggested_tags: string[];
  reasoning: string;
}

export interface ProducerInsight {
  id: string;
  title: string;
  description: string;
  severity: string;
  action_id: string;
  value: number;
}

export interface AssistantPluginStep {
  descriptor_id: string;
  parameters: PluginParameterState[];
  optional: boolean;
}

export interface AssistantPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  steps: AssistantPluginStep[];
}

export interface DashboardWidgetState {
  show_ai_assistant: boolean;
  show_performance: boolean;
  show_insights: boolean;
  collapsed_widget_ids: string[];
  dismissed_insight_ids: string[];
  last_refresh_unix_ms: number;
}

export interface PerformanceModeState {
  enabled: boolean;
  safety_lock: boolean;
  launch_quantize_beats: number;
  cue_preview_enabled: boolean;
  crossfader: number;
  active_macro_id?: string;
  selected_scene_id?: string;
}

export interface MacroTrackMute {
  track_id: string;
  muted: boolean;
}

export interface MacroSendOverride {
  send_id: string;
  amount: number;
  enabled: boolean;
}

export interface PerformanceMacro {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  launch_scene_id?: string;
  track_mutes: MacroTrackMute[];
  send_overrides: MacroSendOverride[];
  trigger_cue_ids: string[];
  color: string;
}

export interface SceneTrigger {
  id: string;
  scene_id: string;
  key_binding: string;
  macro_id?: string;
  launch_quantize_beats: number;
  enabled: boolean;
}

export interface ShowCue {
  id: string;
  name: string;
  protocol: string;
  address: string;
  value: number;
  duration_ms: number;
  color_hex?: string;
  enabled: boolean;
}

export interface LightingCueBinding {
  id: string;
  macro_id: string;
  show_cue_id: string;
  on_scene_launch: boolean;
  enabled: boolean;
}

export interface VisualSyncState {
  enabled: boolean;
  bpm_multiplier: number;
  fps_limit: number;
  strobe_on_scene_launch: boolean;
  latency_ms: number;
  last_event_unix_ms?: number;
}

export interface ThemeTokenSet {
  bg_hex: string;
  surface_hex: string;
  panel_hex: string;
  border_hex: string;
  text_hex: string;
  text_muted_hex: string;
  accent_hex: string;
  cyan_hex: string;
  magenta_hex: string;
  amber_hex: string;
}

export interface BrandingConfig {
  brand_name: string;
  artist_name: string;
  logo_text: string;
  motto: string;
  theme: ThemeTokenSet;
  performance_palette: string[];
  enable_glow: boolean;
}

// ---------------------------------------------------------------------------
// Phase 6: DJ deck / library / live set workflow
// ---------------------------------------------------------------------------

export interface BeatGrid {
  bpm: number;
  offset_secs: number;
  confidence: number;
}

export interface PhraseMarker {
  id: string;
  start_secs: number;
  length_bars: number;
  energy: number;
  label?: string;
}

export interface KeyAnalysis {
  key: string;
  scale: string;
  camelot?: string;
  confidence: number;
  source: string;
}

export interface CuePoint {
  id: string;
  label: string;
  position_secs: number;
  color_hex?: string;
}

export interface DeckLoopState {
  enabled: boolean;
  start_secs: number;
  end_secs: number;
  quantize_beats: number;
}

export interface LibraryItem {
  id: string;
  media_asset_id: string;
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  bpm?: number;
  beat_grid?: BeatGrid;
  key_analysis?: KeyAnalysis;
  phrase_markers: PhraseMarker[];
  cue_points: CuePoint[];
  saved_loops: DeckLoopState[];
  rating: number;
  comment?: string;
  added_unix_ms: number;
  last_played_unix_ms?: number;
  play_count: number;
}

export interface Crate {
  id: string;
  name: string;
  color_hex?: string;
  item_ids: string[];
  smart_query?: string;
  created_unix_ms: number;
}

export interface DeckTrackReference {
  library_item_id: string;
  media_asset_id: string;
}

export interface DeckState {
  id: string;
  loaded_track?: DeckTrackReference;
  playing: boolean;
  position_secs: number;
  tempo_bpm: number;
  tempo_multiplier: number;
  pitch_lock: boolean;
  gain_db: number;
  filter: number;
  hot_cues: CuePoint[];
  loop_state?: DeckLoopState;
  beat_phase: number;
  quantize_beats: number;
  vinyl_mode: boolean;
  jog_sensitivity: number;
}

export interface DeckSyncState {
  enabled: boolean;
  master_deck_id: string;
  sync_quantize_beats: number;
  tempo_tolerance: number;
  phase_lock: boolean;
  last_sync_unix_ms?: number;
}

export type CrossfaderSide = "left" | "center" | "right";

export interface CrossfaderTrackBinding {
  track_id: string;
  side: CrossfaderSide;
}

export interface CrossfaderState {
  position: number;
  curve: number;
  deck_a_gain: number;
  deck_b_gain: number;
  track_bindings: CrossfaderTrackBinding[];
}

export interface SamplerSlot {
  id: string;
  name: string;
  library_item_id?: string;
  gain_db: number;
  one_shot: boolean;
}

export interface PerformancePad {
  id: string;
  name: string;
  sampler_slot_id?: string;
  scene_id?: string;
  macro_id?: string;
  show_trigger_id?: string;
  quantize_beats: number;
  color: string;
  enabled: boolean;
  last_trigger_unix_ms?: number;
}

export interface SetlistEntry {
  id: string;
  library_item_id: string;
  target_deck_id: string;
  note?: string;
  transition_hint?: string;
  target_bpm?: number;
  prepared_cue_id?: string;
  played: boolean;
}

export interface Setlist {
  id: string;
  name: string;
  date_label?: string;
  venue?: string;
  notes?: string;
  entries: SetlistEntry[];
  active_entry_id?: string;
}

export interface OscBinding {
  address: string;
  host: string;
  port: number;
  argument_type: string;
}

export interface MidiBinding {
  channel: number;
  status: string;
  data1: number;
  data2: number;
  device_name?: string;
}

export interface ShowTrigger {
  id: string;
  name: string;
  enabled: boolean;
  value: number;
  quantize_beats: number;
  osc_binding?: OscBinding;
  midi_binding?: MidiBinding;
}

export interface DeckEventBinding {
  id: string;
  event: string;
  deck_id?: string;
  show_trigger_id: string;
  enabled: boolean;
}

export interface DeckSceneLink {
  id: string;
  scene_id: string;
  preferred_deck_id: string;
  library_item_id?: string;
  auto_load: boolean;
}

// ---------------------------------------------------------------------------
// Phase 7: Show engine / DMX / safety / dashboard
// ---------------------------------------------------------------------------

export interface LightingChannelValue {
  channel: number;
  value: number;
}

export interface LightingCue {
  id: string;
  name: string;
  universe: number;
  values: LightingChannelValue[];
  fade_ms: number;
  hold_ms: number;
  tags: string[];
  enabled: boolean;
}

export interface CueSequenceStep {
  id: string;
  lighting_cue_id?: string;
  show_trigger_id?: string;
  visual_cue_id?: string;
  offset_beats: number;
  duration_beats: number;
  enabled: boolean;
}

export interface CueSequence {
  id: string;
  name: string;
  steps: CueSequenceStep[];
  loop_enabled: boolean;
  linked_scene_id?: string;
  linked_library_item_id?: string;
  enabled: boolean;
}

export interface CueTrigger {
  id: string;
  name: string;
  trigger_source: string;
  trigger_event: string;
  deck_id?: string;
  scene_id?: string;
  library_item_id?: string;
  cue_sequence_id?: string;
  lighting_cue_id?: string;
  quantize_beats: number;
  enabled: boolean;
}

export interface VisualCue {
  id: string;
  name: string;
  host: string;
  port: number;
  address: string;
  payload: string;
  enabled: boolean;
}

export interface SyncEvent {
  id: string;
  source: string;
  event: string;
  payload: string;
  unix_ms: number;
}

export interface DmxUniverseState {
  universe: number;
  channels: number[];
  last_update_unix_ms?: number;
  blackout: boolean;
}

export interface DmxBridgeConfig {
  enabled: boolean;
  protocol: string;
  host: string;
  port: number;
  fps_limit: number;
}

export interface DmxBinding {
  universe: number;
  channel: number;
  value: number;
}

export interface DeviceBinding {
  id: string;
  name: string;
  enabled: boolean;
  midi_binding?: MidiBinding;
  osc_binding?: OscBinding;
  dmx_binding?: DmxBinding;
  target_trigger_id?: string;
  target_sequence_id?: string;
  notes?: string;
}

export interface BlackoutState {
  enabled: boolean;
  fade_ms: number;
  last_update_unix_ms?: number;
}

export interface PanicAction {
  stop_transport: boolean;
  stop_decks: boolean;
  blackout: boolean;
  reset_sequences: boolean;
  apply_fallback: boolean;
}

export interface FallbackProfile {
  id: string;
  name: string;
  dmx_universes: DmxUniverseState[];
  scene_id?: string;
  note?: string;
}

export interface SafetyState {
  panic_active: boolean;
  guard_enabled: boolean;
  blackout: BlackoutState;
  last_action?: string;
  last_error?: string;
  fail_count: number;
}

export interface PerformanceDashboardState {
  active_sequence_id?: string;
  queued_trigger_id?: string;
  active_scene_id?: string;
  deck_a_item_id?: string;
  deck_b_item_id?: string;
  last_sync_unix_ms?: number;
  status_banner?: string;
  recent_events: SyncEvent[];
  dropped_events: number;
  last_sequence_beat: number;
}

export interface SongCueMap {
  id: string;
  library_item_id?: string;
  scene_id?: string;
  transition_event: string;
  cue_sequence_id?: string;
  lighting_cue_id?: string;
  visual_cue_id?: string;
  enabled: boolean;
}

export interface ShowProject {
  id: string;
  name: string;
  dmx_bridge: DmxBridgeConfig;
  lighting_cues: LightingCue[];
  cue_sequences: CueSequence[];
  cue_triggers: CueTrigger[];
  song_cue_maps: SongCueMap[];
  device_bindings: DeviceBinding[];
  visual_cues: VisualCue[];
  dmx_universes: DmxUniverseState[];
  fallback_profiles: FallbackProfile[];
  safety_state: SafetyState;
  dashboard: PerformanceDashboardState;
  active_sequence_id?: string;
  active_show_file_path?: string;
}

// ---------------------------------------------------------------------------
// Track + Project
// ---------------------------------------------------------------------------

export interface InstrumentAssignment {
  id: string;
  name: string;
  plugin_type: "builtin_synth" | "builtin_drums" | "vst";
  preset?: string;
}

export type TrackType = "audio" | "midi";

export interface Track {
  id: string;
  name: string;
  index: number;
  track_type: TrackType;
  clips: TimelineClip[];
  midi_clips: MidiClip[];
  instrument?: InstrumentAssignment;
  volume_db: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  group_track_id?: string;
  plugin_chain: PluginChain;
  freeze_state: FreezeState;
  take_lanes: TakeLane[];
  comp_regions: CompRegion[];
  armed: boolean;
}

export interface LoopRegion {
  start_secs: number;
  end_secs: number;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Drum sequencer
// ---------------------------------------------------------------------------

export interface DrumStep {
  active: boolean;
  velocity: number;
}

export interface DrumRow {
  pitch: number;
  label: string;
  steps: DrumStep[];
}

export const DEFAULT_DRUM_PITCHES: { pitch: number; label: string }[] = [
  { pitch: 36, label: "Kick" },
  { pitch: 38, label: "Snare" },
  { pitch: 40, label: "Clap" },
  { pitch: 42, label: "CHH" },
  { pitch: 46, label: "OHH" },
  { pitch: 47, label: "Tom 1" },
  { pitch: 48, label: "Tom 2" },
  { pitch: 49, label: "Crash" },
];

export interface Project {
  version: number;
  title: string;
  bpm: number;
  sample_rate: number;
  media: MediaAsset[];
  tracks: Track[];
  loop_region?: LoopRegion;
  session: SessionState;
  automation_lanes: AutomationLane[];
  routing: RoutingState;
  browser_index: BrowserIndexState;
  templates: TemplateDefinition[];
  active_template_id?: string;
  plugin_registry: PluginDescriptor[];
  sidechain_routes: SidechainRoute[];
  render_jobs: RenderJob[];
  recovery_snapshots: RecoverySnapshot[];
  shortcuts: ShortcutBinding[];
  monitoring: MonitoringState;
  autosave_interval_secs: number;
  navigation: NavigationState;
  preferences: UserPreferences;
  device_profiles: DeviceProfile[];
  device_diagnostics: DeviceDiagnosticState;
  compatibility_reports: CompatibilityReport[];
  migration_history: MigrationPlan[];
  error_reports: ErrorReport[];
  support_bundles: SupportBundle[];
  performance_profile: PerformanceProfile;
  release_config: ReleaseConfig;
  onboarding: OnboardingState;
  system_health: SystemHealthSnapshot;
  asset_classifications: AssetClassification[];
  dashboard_widget_state: DashboardWidgetState;
  performance_mode: PerformanceModeState;
  performance_macros: PerformanceMacro[];
  scene_triggers: SceneTrigger[];
  show_cues: ShowCue[];
  lighting_cue_bindings: LightingCueBinding[];
  visual_sync: VisualSyncState;
  branding: BrandingConfig;
  library_items: LibraryItem[];
  crates: Crate[];
  decks: DeckState[];
  deck_sync: DeckSyncState;
  crossfader: CrossfaderState;
  sampler_slots: SamplerSlot[];
  performance_pads: PerformancePad[];
  setlists: Setlist[];
  active_setlist_id?: string;
  show_triggers: ShowTrigger[];
  deck_event_bindings: DeckEventBinding[];
  deck_scene_links: DeckSceneLink[];
  show_project: ShowProject;
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

export type RecordingStatus = "idle" | "count_in" | "recording" | "stopping";
