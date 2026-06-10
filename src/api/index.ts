/**
 * Tauri invoke wrappers for backend commands.
 * Phase 2: MIDI clips, loop region, recording, track type.
 */

import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type {
  Project,
  MediaAsset,
  Track,
  TimelineClip,
  WaveformPeaks,
  MidiClip,
  InstrumentAssignment,
  PluginDescriptor,
  RenderJob,
  SidechainRoute,
  RecoverySnapshot,
  MonitoringState,
  NavigationState,
  UserPreferences,
  ShortcutBinding,
  StemExportConfig,
  DeviceDiagnosticState,
  DeviceProfile,
  CompatibilityReport,
  MissingMediaAsset,
  MediaRelinkResult,
  PluginChainIssue,
  MigrationPlan,
  ErrorReport,
  SupportBundle,
  PerformanceProfile,
  ReleaseConfig,
  ReleaseReadinessCheck,
  OnboardingState,
  SystemHealthSnapshot,
  AssetClassification,
  AssistantPreset,
  Crate,
  CrossfaderSide,
  CrossfaderState,
  CuePoint,
  CueSequence,
  CueTrigger,
  DeviceBinding,
  DmxBridgeConfig,
  FallbackProfile,
  DeckEventBinding,
  DeckSceneLink,
  DeckState,
  DeckSyncState,
  DeckLoopState,
  LightingCue,
  LibraryItem,
  PanicAction,
  PerformanceDashboardState,
  BrandingConfig,
  DashboardWidgetState,
  HarmonySuggestionPack,
  LightingCueBinding,
  PerformanceMacro,
  PerformancePad,
  PerformanceModeState,
  ProducerInsight,
  SamplerSlot,
  SafetyState,
  ShowProject,
  SongCueMap,
  SceneTrigger,
  Setlist,
  ShowCue,
  ShowTrigger,
  VisualCue,
  VisualSyncState,
} from "../types";

export const TAURI_MISSING_MESSAGE =
  "Tauri runtime not detected. Start the desktop host with `npm run tauri:dev` instead of plain `npm run dev`.";

type RuntimeWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

let warnedMissingTauri = false;

export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean((window as RuntimeWindow).__TAURI_INTERNALS__);
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    if (!warnedMissingTauri) {
      warnedMissingTauri = true;
      console.warn(TAURI_MISSING_MESSAGE);
    }
    throw new Error(TAURI_MISSING_MESSAGE);
  }
  return tauriInvoke<T>(command, args);
}

export async function projectNew(): Promise<Project> {
  return invoke<Project>("project_new");
}

export async function projectGet(): Promise<Project> {
  return invoke<Project>("project_get");
}

export async function projectSave(path: string): Promise<void> {
  return invoke("project_save", { path });
}

export async function projectOpen(path: string): Promise<Project> {
  return invoke<Project>("project_open", { path });
}

export async function projectUpdate(project: Project): Promise<Project> {
  return invoke<Project>("project_update", { project });
}

export async function mediaImportAudio(path: string): Promise<MediaAsset> {
  return invoke<MediaAsset>("media_import_audio", { path });
}

export async function waveformPeaks(path: string, numBuckets: number): Promise<WaveformPeaks> {
  return invoke<WaveformPeaks>("waveform_peaks", { path, numBuckets });
}

export async function trackAdd(name: string, trackType?: "audio" | "midi"): Promise<Track> {
  return invoke<Track>("track_add", { name, trackType: trackType ?? "audio" });
}

export async function clipPlace(payload: {
  media_asset_id: string;
  track_index: number;
  start_secs: number;
  source_offset_secs: number;
  duration_secs: number;
}): Promise<TimelineClip> {
  return invoke<TimelineClip>("clip_place", { payload });
}

export async function playbackPlay(payload: {
  path: string;
  offset_secs: number;
  duration_secs: number;
}): Promise<void> {
  return invoke("playback_play", { payload });
}

export async function playbackPlayArrangement(startSecs = 0): Promise<void> {
  return invoke("playback_play_arrangement", { startSecs });
}

export async function playbackStop(): Promise<void> {
  return invoke("playback_stop");
}

export async function playbackPositionMs(): Promise<number> {
  return invoke<number>("playback_position_ms");
}

export async function playbackIsPlaying(): Promise<boolean> {
  return invoke<boolean>("playback_is_playing");
}

export async function playbackSeek(positionSecs: number): Promise<void> {
  return invoke("playback_seek", { positionSecs });
}

// ---------------------------------------------------------------------------
// Phase 2: MIDI clips
// ---------------------------------------------------------------------------

export async function midiClipAdd(payload: {
  track_id: string;
  start_secs: number;
  duration_secs: number;
}): Promise<MidiClip> {
  return invoke<MidiClip>("midi_clip_add", { payload });
}

export async function midiClipUpdate(trackId: string, clip: MidiClip): Promise<MidiClip> {
  return invoke<MidiClip>("midi_clip_update", { trackId, clip });
}

export async function midiClipDelete(trackId: string, clipId: string): Promise<void> {
  return invoke("midi_clip_delete", { trackId, clipId });
}

export async function midiClipDuplicate(trackId: string, clipId: string): Promise<MidiClip> {
  return invoke<MidiClip>("midi_clip_duplicate", { trackId, clipId });
}

// ---------------------------------------------------------------------------
// Phase 2: Loop region
// ---------------------------------------------------------------------------

export async function loopRegionSet(startSecs: number, endSecs: number, enabled: boolean): Promise<void> {
  return invoke("loop_region_set", { startSecs, endSecs, enabled });
}

export async function loopRegionClear(): Promise<void> {
  return invoke("loop_region_clear");
}

// ---------------------------------------------------------------------------
// Phase 2: Track type / instrument
// ---------------------------------------------------------------------------

export async function trackSetType(trackId: string, trackType: string): Promise<Track> {
  return invoke<Track>("track_set_type", { trackId, trackType });
}

export async function trackSetInstrument(trackId: string, instrument: InstrumentAssignment): Promise<Track> {
  return invoke<Track>("track_set_instrument", { trackId, instrument });
}

// ---------------------------------------------------------------------------
// Phase 2: Recording
// ---------------------------------------------------------------------------

export async function recordingListDevices(): Promise<string[]> {
  return invoke<string[]>("recording_list_devices");
}

export async function recordingStart(
  deviceName: string | null,
  outputPath: string,
  targetBufferMs?: number | null
): Promise<void> {
  return invoke("recording_start", {
    deviceName,
    outputPath,
    targetBufferMs: targetBufferMs ?? null,
  });
}

export async function recordingStop(): Promise<string> {
  return invoke<string>("recording_stop");
}

export async function recordingIsActive(): Promise<boolean> {
  return invoke<boolean>("recording_is_active");
}

// ---------------------------------------------------------------------------
// Phase 4: Plugin hosting / chain management
// ---------------------------------------------------------------------------

export async function pluginScanDefault(): Promise<PluginDescriptor[]> {
  return invoke<PluginDescriptor[]>("plugin_scan_default");
}

export async function pluginScanPaths(roots: string[]): Promise<PluginDescriptor[]> {
  return invoke<PluginDescriptor[]>("plugin_scan_paths", { roots });
}

export async function trackPluginInsert(trackId: string, descriptorId: string): Promise<Track> {
  return invoke<Track>("track_plugin_insert", { trackId, descriptorId });
}

export async function trackPluginRemove(trackId: string, instanceId: string): Promise<Track> {
  return invoke<Track>("track_plugin_remove", { trackId, instanceId });
}

export async function trackPluginMove(trackId: string, instanceId: string, toIndex: number): Promise<Track> {
  return invoke<Track>("track_plugin_move", { trackId, instanceId, toIndex });
}

export async function trackPluginSetBypass(trackId: string, instanceId: string, bypassed: boolean): Promise<Track> {
  return invoke<Track>("track_plugin_set_bypass", { trackId, instanceId, bypassed });
}

export async function trackPluginSetEnabled(trackId: string, instanceId: string, enabled: boolean): Promise<Track> {
  return invoke<Track>("track_plugin_set_enabled", { trackId, instanceId, enabled });
}

export async function trackPluginSetParameter(
  trackId: string,
  instanceId: string,
  parameterId: string,
  value: number
): Promise<Track> {
  return invoke<Track>("track_plugin_set_parameter", { trackId, instanceId, parameterId, value });
}

// ---------------------------------------------------------------------------
// Phase 4: Sidechain / render / freeze
// ---------------------------------------------------------------------------

export async function sidechainRouteAdd(payload: {
  fromTrackId: string;
  toTrackId: string;
  targetPluginInstanceId?: string;
  amount: number;
}): Promise<SidechainRoute> {
  return invoke<SidechainRoute>("sidechain_route_add", payload);
}

export async function sidechainRouteUpdate(routeId: string, amount: number, enabled: boolean): Promise<SidechainRoute> {
  return invoke<SidechainRoute>("sidechain_route_update", { routeId, amount, enabled });
}

export async function sidechainRouteRemove(routeId: string): Promise<void> {
  return invoke("sidechain_route_remove", { routeId });
}

export async function stemExportStart(config: StemExportConfig): Promise<RenderJob> {
  return invoke<RenderJob>("stem_export_start", { config });
}

export async function trackFreeze(trackId: string, outputDir: string): Promise<Track> {
  return invoke<Track>("track_freeze", { trackId, outputDir });
}

export async function trackUnfreeze(trackId: string): Promise<Track> {
  return invoke<Track>("track_unfreeze", { trackId });
}

export async function trackRenderInPlace(
  trackId: string,
  startSecs: number,
  endSecs: number,
  outputDir: string
): Promise<Track> {
  return invoke<Track>("track_render_in_place", { trackId, startSecs, endSecs, outputDir });
}

// ---------------------------------------------------------------------------
// Phase 4: Take lanes / comping
// ---------------------------------------------------------------------------

export async function takeLaneAdd(trackId: string, name?: string): Promise<Track> {
  return invoke<Track>("take_lane_add", { trackId, name });
}

export async function takeLaneClipAdd(payload: {
  trackId: string;
  laneId: string;
  mediaAssetId: string;
  startSecs: number;
  sourceOffsetSecs: number;
  durationSecs: number;
}): Promise<Track> {
  return invoke<Track>("take_lane_clip_add", payload);
}

export async function compRegionSet(payload: {
  trackId: string;
  laneId: string;
  takeClipId: string;
  startSecs: number;
  endSecs: number;
  fadeSecs: number;
}): Promise<Track> {
  return invoke<Track>("comp_region_set", payload);
}

export async function compRegionClear(trackId: string, regionId: string): Promise<Track> {
  return invoke<Track>("comp_region_clear", { trackId, regionId });
}

// ---------------------------------------------------------------------------
// Phase 4: Recovery / monitoring / shortcuts
// ---------------------------------------------------------------------------

export async function recoverySnapshotSave(reason?: string): Promise<RecoverySnapshot> {
  return invoke<RecoverySnapshot>("recovery_snapshot_save", { reason });
}

export async function recoverySnapshotList(): Promise<RecoverySnapshot[]> {
  return invoke<RecoverySnapshot[]>("recovery_snapshot_list");
}

export async function recoverySnapshotRestore(snapshotPath: string): Promise<Project> {
  return invoke<Project>("recovery_snapshot_restore", { snapshotPath });
}

export async function monitoringUpdate(monitoring: MonitoringState): Promise<MonitoringState> {
  return invoke<MonitoringState>("monitoring_update", { monitoring });
}

export async function autosaveIntervalSet(intervalSecs: number): Promise<number> {
  return invoke<number>("autosave_interval_set", { intervalSecs });
}

export async function shortcutBindingsSet(bindings: ShortcutBinding[]): Promise<ShortcutBinding[]> {
  return invoke<ShortcutBinding[]>("shortcut_bindings_set", { bindings });
}

// ---------------------------------------------------------------------------
// Phase 5: Assistant / dashboard / performance / show-control / branding
// ---------------------------------------------------------------------------

export async function assistantHarmonyGenerate(payload: {
  keyRoot: string;
  scale: string;
  energy: number;
  bars: number;
}): Promise<HarmonySuggestionPack> {
  return invoke<HarmonySuggestionPack>("assistant_harmony_generate", payload);
}

export async function assistantAssetClassify(applyTags: boolean): Promise<AssetClassification[]> {
  return invoke<AssetClassification[]>("assistant_asset_classify", { applyTags });
}

export async function assistantVocalPresets(): Promise<AssistantPreset[]> {
  return invoke<AssistantPreset[]>("assistant_vocal_presets");
}

export async function assistantPresetApply(trackId: string, presetId: string): Promise<Track> {
  return invoke<Track>("assistant_preset_apply", { trackId, presetId });
}

export async function dashboardInsightsGenerate(): Promise<ProducerInsight[]> {
  return invoke<ProducerInsight[]>("dashboard_insights_generate");
}

export async function dashboardWidgetStateUpdate(
  widgetState: DashboardWidgetState
): Promise<DashboardWidgetState> {
  return invoke<DashboardWidgetState>("dashboard_widget_state_update", { widgetState });
}

export async function performanceModeUpdate(mode: PerformanceModeState): Promise<PerformanceModeState> {
  return invoke<PerformanceModeState>("performance_mode_update", { mode });
}

export async function performanceMacroUpsert(macroConfig: PerformanceMacro): Promise<PerformanceMacro> {
  return invoke<PerformanceMacro>("performance_macro_upsert", { macroConfig });
}

export async function performanceMacroRemove(macroId: string): Promise<void> {
  return invoke("performance_macro_remove", { macroId });
}

export async function performanceMacroTrigger(macroId: string): Promise<PerformanceMacro> {
  return invoke<PerformanceMacro>("performance_macro_trigger", { macroId });
}

export async function sceneTriggerUpsert(trigger: SceneTrigger): Promise<SceneTrigger> {
  return invoke<SceneTrigger>("scene_trigger_upsert", { trigger });
}

export async function sceneTriggerRemove(triggerId: string): Promise<void> {
  return invoke("scene_trigger_remove", { triggerId });
}

export async function showCueUpsert(cue: ShowCue): Promise<ShowCue> {
  return invoke<ShowCue>("show_cue_upsert", { cue });
}

export async function showCueRemove(cueId: string): Promise<void> {
  return invoke("show_cue_remove", { cueId });
}

export async function showCuePreview(cueId: string): Promise<string> {
  return invoke<string>("show_cue_preview", { cueId });
}

export async function lightingCueBindingUpsert(binding: LightingCueBinding): Promise<LightingCueBinding> {
  return invoke<LightingCueBinding>("lighting_cue_binding_upsert", { binding });
}

export async function lightingCueBindingRemove(bindingId: string): Promise<void> {
  return invoke("lighting_cue_binding_remove", { bindingId });
}

export async function visualSyncUpdate(visualSync: VisualSyncState): Promise<VisualSyncState> {
  return invoke<VisualSyncState>("visual_sync_update", { visualSync });
}

export async function brandingUpdate(branding: BrandingConfig): Promise<BrandingConfig> {
  return invoke<BrandingConfig>("branding_update", { branding });
}

// ---------------------------------------------------------------------------
// Phase 6: DJ decks / library / crates / setlists / show triggers
// ---------------------------------------------------------------------------

export async function libraryItemAnalyzeUpsert(mediaAssetId: string): Promise<LibraryItem> {
  return invoke<LibraryItem>("library_item_analyze_upsert", { mediaAssetId });
}

export async function libraryItemUpdate(item: LibraryItem): Promise<LibraryItem> {
  return invoke<LibraryItem>("library_item_update", { item });
}

export async function crateUpsert(crateState: Crate): Promise<Crate> {
  return invoke<Crate>("crate_upsert", { crateConfig: crateState });
}

export async function crateRemove(crateId: string): Promise<void> {
  return invoke("crate_remove", { crateId });
}

export async function crateItemAdd(crateId: string, itemId: string): Promise<Crate> {
  return invoke<Crate>("crate_item_add", { crateId, itemId });
}

export async function crateItemRemove(crateId: string, itemId: string): Promise<Crate> {
  return invoke<Crate>("crate_item_remove", { crateId, itemId });
}

export async function deckLoadTrack(deckId: string, libraryItemId: string): Promise<DeckState> {
  return invoke<DeckState>("deck_load_track", {
    deckId,
    libraryItemId,
  });
}

export async function deckSetPlaying(deckId: string, playing: boolean): Promise<DeckState> {
  return invoke<DeckState>("deck_set_playing", { deckId, playing });
}

export async function deckSeekPosition(deckId: string, positionSecs: number): Promise<DeckState> {
  return invoke<DeckState>("deck_seek_position", { deckId, positionSecs });
}

export async function deckTurntableNudge(deckId: string, deltaBeats: number): Promise<DeckState> {
  return invoke<DeckState>("deck_turntable_nudge", { deckId, deltaBeats });
}

export async function deckTurntableScratch(
  deckId: string,
  deltaSecs: number,
  friction?: number
): Promise<DeckState> {
  return invoke<DeckState>("deck_turntable_scratch", {
    deckId,
    deltaSecs,
    friction: friction ?? null,
  });
}

export async function deckTurntableConfigure(
  deckId: string,
  vinylMode: boolean,
  jogSensitivity: number
): Promise<DeckState> {
  return invoke<DeckState>("deck_turntable_configure", {
    deckId,
    vinylMode,
    jogSensitivity,
  });
}

export async function deckHotCueSet(
  deckId: string,
  label: string,
  positionSecs: number,
  colorHex?: string
): Promise<CuePoint> {
  return invoke<CuePoint>("deck_hot_cue_set", {
    deckId,
    label,
    positionSecs,
    colorHex: colorHex ?? null,
  });
}

export async function deckHotCueTrigger(deckId: string, cueId: string): Promise<DeckState> {
  return invoke<DeckState>("deck_hot_cue_trigger", { deckId, cueId });
}

export async function deckHotCueRemove(deckId: string, cueId: string): Promise<DeckState> {
  return invoke<DeckState>("deck_hot_cue_remove", { deckId, cueId });
}

export async function deckLoopSet(
  deckId: string,
  startSecs: number,
  endSecs: number,
  quantizeBeats: number
): Promise<DeckLoopState> {
  return invoke<DeckLoopState>("deck_loop_set", {
    deckId,
    startSecs,
    endSecs,
    quantizeBeats,
  });
}

export async function deckLoopClear(deckId: string): Promise<DeckState> {
  return invoke<DeckState>("deck_loop_clear", { deckId });
}

export async function deckSyncUpdate(sync: DeckSyncState): Promise<DeckSyncState> {
  return invoke<DeckSyncState>("deck_sync_update", { sync });
}

export async function deckSyncApply(masterDeckId: string, followerDeckId: string): Promise<DeckState[]> {
  return invoke<DeckState[]>("deck_sync_apply", { masterDeckId, followerDeckId });
}

export async function crossfaderUpdate(crossfader: CrossfaderState): Promise<CrossfaderState> {
  return invoke<CrossfaderState>("crossfader_update", { crossfader });
}

export async function crossfaderBindTrack(trackId: string, side: CrossfaderSide): Promise<CrossfaderState> {
  return invoke<CrossfaderState>("crossfader_bind_track", { trackId, side });
}

export async function samplerSlotUpsert(slot: SamplerSlot): Promise<SamplerSlot> {
  return invoke<SamplerSlot>("sampler_slot_upsert", { slot });
}

export async function samplerSlotRemove(slotId: string): Promise<void> {
  return invoke("sampler_slot_remove", { slotId });
}

export async function performancePadUpsert(pad: PerformancePad): Promise<PerformancePad> {
  return invoke<PerformancePad>("performance_pad_upsert", { pad });
}

export async function performancePadRemove(padId: string): Promise<void> {
  return invoke("performance_pad_remove", { padId });
}

export async function performancePadTrigger(padId: string): Promise<PerformancePad> {
  return invoke<PerformancePad>("performance_pad_trigger", { padId });
}

export async function setlistUpsert(setlist: Setlist): Promise<Setlist> {
  return invoke<Setlist>("setlist_upsert", { setlist });
}

export async function setlistRemove(setlistId: string): Promise<void> {
  return invoke("setlist_remove", { setlistId });
}

export async function setlistSetActive(setlistId?: string): Promise<string | null> {
  return invoke<string | null>("setlist_set_active", { setlistId: setlistId ?? null });
}

export async function setlistEntryMarkPlayed(
  setlistId: string,
  entryId: string,
  played: boolean
): Promise<Setlist> {
  return invoke<Setlist>("setlist_entry_mark_played", {
    setlistId,
    entryId,
    played,
  });
}

export async function showTriggerUpsert(trigger: ShowTrigger): Promise<ShowTrigger> {
  return invoke<ShowTrigger>("show_trigger_upsert", { trigger });
}

export async function showTriggerRemove(triggerId: string): Promise<void> {
  return invoke("show_trigger_remove", { triggerId });
}

export async function showTriggerExecute(triggerId: string): Promise<string> {
  return invoke<string>("show_trigger_execute", { triggerId });
}

export async function deckEventBindingUpsert(binding: DeckEventBinding): Promise<DeckEventBinding> {
  return invoke<DeckEventBinding>("deck_event_binding_upsert", { binding });
}

export async function deckEventBindingRemove(bindingId: string): Promise<void> {
  return invoke("deck_event_binding_remove", { bindingId });
}

export async function deckSceneLinkUpsert(link: DeckSceneLink): Promise<DeckSceneLink> {
  return invoke<DeckSceneLink>("deck_scene_link_upsert", { link });
}

export async function deckSceneLinkRemove(linkId: string): Promise<void> {
  return invoke("deck_scene_link_remove", { linkId });
}

export async function deckSceneCoordinate(sceneId: string): Promise<string[]> {
  return invoke<string[]>("deck_scene_coordinate", { sceneId });
}

// ---------------------------------------------------------------------------
// Phase 7: Show engine / DMX / sequencing / safety
// ---------------------------------------------------------------------------

export async function showProjectUpdate(showProject: ShowProject): Promise<ShowProject> {
  return invoke<ShowProject>("show_project_update", { showProject });
}

export async function dmxBridgeUpdate(bridge: DmxBridgeConfig): Promise<DmxBridgeConfig> {
  return invoke<DmxBridgeConfig>("dmx_bridge_update", { bridge });
}

export async function lightingCueUpsert(cue: LightingCue): Promise<LightingCue> {
  return invoke<LightingCue>("lighting_cue_upsert", { cue });
}

export async function lightingCueRemove(cueId: string): Promise<void> {
  return invoke("lighting_cue_remove", { cueId });
}

export async function lightingCueExecute(cueId: string): Promise<string> {
  return invoke<string>("lighting_cue_execute", { cueId });
}

export async function visualCueUpsert(cue: VisualCue): Promise<VisualCue> {
  return invoke<VisualCue>("visual_cue_upsert", { cue });
}

export async function visualCueRemove(cueId: string): Promise<void> {
  return invoke("visual_cue_remove", { cueId });
}

export async function visualCueExecute(cueId: string): Promise<string> {
  return invoke<string>("visual_cue_execute", { cueId });
}

export async function cueSequenceUpsert(sequence: CueSequence): Promise<CueSequence> {
  return invoke<CueSequence>("cue_sequence_upsert", { sequence });
}

export async function cueSequenceRemove(sequenceId: string): Promise<void> {
  return invoke("cue_sequence_remove", { sequenceId });
}

export async function cueSequenceStart(sequenceId: string): Promise<CueSequence> {
  return invoke<CueSequence>("cue_sequence_start", { sequenceId });
}

export async function cueSequenceStop(): Promise<string | null> {
  return invoke<string | null>("cue_sequence_stop");
}

export async function cueSequenceTick(positionBeats: number): Promise<string[]> {
  return invoke<string[]>("cue_sequence_tick", { positionBeats });
}

export async function cueTriggerUpsert(trigger: CueTrigger): Promise<CueTrigger> {
  return invoke<CueTrigger>("cue_trigger_upsert", { trigger });
}

export async function cueTriggerRemove(triggerId: string): Promise<void> {
  return invoke("cue_trigger_remove", { triggerId });
}

export async function cueTriggerFire(triggerId: string): Promise<string[]> {
  return invoke<string[]>("cue_trigger_fire", { triggerId });
}

export async function songCueMapUpsert(map: SongCueMap): Promise<SongCueMap> {
  return invoke<SongCueMap>("song_cue_map_upsert", { map });
}

export async function songCueMapRemove(mapId: string): Promise<void> {
  return invoke("song_cue_map_remove", { mapId });
}

export async function songCueMapTrigger(payload: {
  sceneId?: string;
  libraryItemId?: string;
  transitionEvent: string;
}): Promise<string[]> {
  return invoke<string[]>("song_cue_map_trigger", payload);
}

export async function deviceBindingUpsert(binding: DeviceBinding): Promise<DeviceBinding> {
  return invoke<DeviceBinding>("device_binding_upsert", { binding });
}

export async function deviceBindingRemove(bindingId: string): Promise<void> {
  return invoke("device_binding_remove", { bindingId });
}

export async function deviceBindingTest(bindingId: string): Promise<string> {
  return invoke<string>("device_binding_test", { bindingId });
}

export async function fallbackProfileUpsert(profile: FallbackProfile): Promise<FallbackProfile> {
  return invoke<FallbackProfile>("fallback_profile_upsert", { profile });
}

export async function fallbackProfileRemove(profileId: string): Promise<void> {
  return invoke("fallback_profile_remove", { profileId });
}

export async function fallbackProfileApply(profileId: string): Promise<FallbackProfile> {
  return invoke<FallbackProfile>("fallback_profile_apply", { profileId });
}

export async function safetyBlackoutSet(enabled: boolean, fadeMs: number): Promise<SafetyState> {
  const state = await invoke<SafetyState>("safety_blackout_set", { enabled, fadeMs });
  return state;
}

export async function safetyPanic(action?: PanicAction): Promise<SafetyState> {
  return invoke<SafetyState>("safety_panic", { action: action ?? null });
}

export async function safetyReset(): Promise<SafetyState> {
  return invoke<SafetyState>("safety_reset");
}

export async function performanceDashboardRefresh(): Promise<PerformanceDashboardState> {
  return invoke<PerformanceDashboardState>("performance_dashboard_refresh");
}

// ---------------------------------------------------------------------------
// Phase 8: Integration / diagnostics / migrations / release readiness
// ---------------------------------------------------------------------------

export async function navigationUpdate(navigation: NavigationState): Promise<NavigationState> {
  return invoke<NavigationState>("navigation_update", { navigation });
}

export async function preferencesUpdate(preferences: UserPreferences): Promise<UserPreferences> {
  return invoke<UserPreferences>("preferences_update", { preferences });
}

export async function deviceProfilesRefresh(): Promise<DeviceProfile[]> {
  return invoke<DeviceProfile[]>("device_profiles_refresh");
}

export async function deviceDiagnosticsRun(): Promise<DeviceDiagnosticState> {
  return invoke<DeviceDiagnosticState>("device_diagnostics_run");
}

export async function compatibilityReportGenerate(): Promise<CompatibilityReport> {
  return invoke<CompatibilityReport>("compatibility_report_generate");
}

export async function migrationPlanGenerate(targetVersion?: number): Promise<MigrationPlan> {
  return invoke<MigrationPlan>("migration_plan_generate", { target_version: targetVersion ?? null });
}

export async function migrationPlanApply(planId: string, backupPath?: string): Promise<MigrationPlan> {
  return invoke<MigrationPlan>("migration_plan_apply", {
    plan_id: planId,
    backup_path: backupPath ?? null,
  });
}

export async function projectMissingMediaScan(): Promise<MissingMediaAsset[]> {
  return invoke<MissingMediaAsset[]>("project_missing_media_scan");
}

export async function projectMissingMediaRelink(
  searchRoots: string[],
  dryRun = true
): Promise<MediaRelinkResult[]> {
  return invoke<MediaRelinkResult[]>("project_missing_media_relink", {
    search_roots: searchRoots,
    dry_run: dryRun,
  });
}

export async function pluginChainPreflight(): Promise<PluginChainIssue[]> {
  return invoke<PluginChainIssue[]>("plugin_chain_preflight");
}

export async function errorReportAdd(payload: {
  source: string;
  message: string;
  severity?: string;
  context?: string;
}): Promise<ErrorReport> {
  return invoke<ErrorReport>("error_report_add", {
    source: payload.source,
    message: payload.message,
    severity: payload.severity ?? null,
    context: payload.context ?? null,
  });
}

export async function errorReportAck(reportId: string, acknowledged: boolean): Promise<ErrorReport> {
  return invoke<ErrorReport>("error_report_ack", { report_id: reportId, acknowledged });
}

export async function errorReportList(): Promise<ErrorReport[]> {
  return invoke<ErrorReport[]>("error_report_list");
}

export async function errorReportDispatch(reportId?: string): Promise<ErrorReport[]> {
  return invoke<ErrorReport[]>("error_report_dispatch", { report_id: reportId ?? null });
}

export async function supportBundleExport(payload: {
  path: string;
  includeProjectState: boolean;
  includeDeviceState: boolean;
  includeLogs: boolean;
}): Promise<SupportBundle> {
  return invoke<SupportBundle>("support_bundle_export", {
    path: payload.path,
    include_project_state: payload.includeProjectState,
    include_device_state: payload.includeDeviceState,
    include_logs: payload.includeLogs,
  });
}

export async function performanceProfileCapture(): Promise<PerformanceProfile> {
  return invoke<PerformanceProfile>("performance_profile_capture");
}

export async function releaseConfigUpdate(releaseConfig: ReleaseConfig): Promise<ReleaseConfig> {
  return invoke<ReleaseConfig>("release_config_update", { releaseConfig });
}

export async function releaseReadinessCheck(): Promise<ReleaseReadinessCheck> {
  return invoke<ReleaseReadinessCheck>("release_readiness_check");
}

export async function onboardingStateUpdate(onboarding: OnboardingState): Promise<OnboardingState> {
  return invoke<OnboardingState>("onboarding_state_update", { onboarding });
}

export async function systemHealthSnapshot(): Promise<SystemHealthSnapshot> {
  return invoke<SystemHealthSnapshot>("system_health_snapshot");
}
