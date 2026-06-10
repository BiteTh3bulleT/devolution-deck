import { create } from "zustand";
import * as api from "../api";
import type {
  CueSequence,
  CueTrigger,
  DeviceBinding,
  DmxBridgeConfig,
  FallbackProfile,
  LightingCue,
  PanicAction,
  PerformanceDashboardState,
  SafetyState,
  ShowProject,
  SongCueMap,
  VisualCue,
} from "../types";
import { useProjectStore } from "./projectStore";

function ensureProject() {
  const project = useProjectStore.getState().project;
  if (!project) {
    throw new Error("No project loaded");
  }
  return project;
}

async function reloadProject() {
  await useProjectStore.getState().load();
}

interface ShowStoreState {
  updateShowProject: (showProject: ShowProject) => Promise<void>;
  refreshDashboard: () => Promise<PerformanceDashboardState>;
  updateDmxBridge: (patch: Partial<DmxBridgeConfig>) => Promise<void>;

  upsertLightingCue: (cue: LightingCue) => Promise<void>;
  removeLightingCue: (cueId: string) => Promise<void>;
  executeLightingCue: (cueId: string) => Promise<string>;

  upsertVisualCue: (cue: VisualCue) => Promise<void>;
  removeVisualCue: (cueId: string) => Promise<void>;
  executeVisualCue: (cueId: string) => Promise<string>;

  upsertSequence: (sequence: CueSequence) => Promise<void>;
  removeSequence: (sequenceId: string) => Promise<void>;
  startSequence: (sequenceId: string) => Promise<void>;
  stopSequence: () => Promise<void>;
  tickSequence: (positionBeats: number) => Promise<string[]>;

  upsertCueTrigger: (trigger: CueTrigger) => Promise<void>;
  removeCueTrigger: (triggerId: string) => Promise<void>;
  fireCueTrigger: (triggerId: string) => Promise<string[]>;

  upsertSongCueMap: (map: SongCueMap) => Promise<void>;
  removeSongCueMap: (mapId: string) => Promise<void>;
  triggerSongCueMap: (libraryItemId?: string, sceneId?: string, transitionEvent?: string) => Promise<string[]>;

  upsertDeviceBinding: (binding: DeviceBinding) => Promise<void>;
  removeDeviceBinding: (bindingId: string) => Promise<void>;
  testDeviceBinding: (bindingId: string) => Promise<string>;

  upsertFallbackProfile: (profile: FallbackProfile) => Promise<void>;
  removeFallbackProfile: (profileId: string) => Promise<void>;
  applyFallbackProfile: (profileId: string) => Promise<void>;

  setBlackout: (enabled: boolean, fadeMs: number) => Promise<SafetyState>;
  panic: (action?: PanicAction) => Promise<SafetyState>;
  resetSafety: () => Promise<SafetyState>;
}

export const useShowStore = create<ShowStoreState>(() => ({
  async updateShowProject(showProject) {
    await api.showProjectUpdate(showProject);
    await reloadProject();
  },

  async refreshDashboard() {
    const dashboard = await api.performanceDashboardRefresh();
    await reloadProject();
    return dashboard;
  },

  async updateDmxBridge(patch) {
    const project = ensureProject();
    await api.dmxBridgeUpdate({ ...project.show_project.dmx_bridge, ...patch });
    await reloadProject();
  },

  async upsertLightingCue(cue) {
    await api.lightingCueUpsert(cue);
    await reloadProject();
  },

  async removeLightingCue(cueId) {
    await api.lightingCueRemove(cueId);
    await reloadProject();
  },

  async executeLightingCue(cueId) {
    const payload = await api.lightingCueExecute(cueId);
    await reloadProject();
    return payload;
  },

  async upsertVisualCue(cue) {
    await api.visualCueUpsert(cue);
    await reloadProject();
  },

  async removeVisualCue(cueId) {
    await api.visualCueRemove(cueId);
    await reloadProject();
  },

  async executeVisualCue(cueId) {
    const payload = await api.visualCueExecute(cueId);
    await reloadProject();
    return payload;
  },

  async upsertSequence(sequence) {
    await api.cueSequenceUpsert(sequence);
    await reloadProject();
  },

  async removeSequence(sequenceId) {
    await api.cueSequenceRemove(sequenceId);
    await reloadProject();
  },

  async startSequence(sequenceId) {
    await api.cueSequenceStart(sequenceId);
    await reloadProject();
  },

  async stopSequence() {
    await api.cueSequenceStop();
    await reloadProject();
  },

  async tickSequence(positionBeats) {
    const actions = await api.cueSequenceTick(positionBeats);
    return actions;
  },

  async upsertCueTrigger(trigger) {
    await api.cueTriggerUpsert(trigger);
    await reloadProject();
  },

  async removeCueTrigger(triggerId) {
    await api.cueTriggerRemove(triggerId);
    await reloadProject();
  },

  async fireCueTrigger(triggerId) {
    const actions = await api.cueTriggerFire(triggerId);
    await reloadProject();
    return actions;
  },

  async upsertSongCueMap(map) {
    await api.songCueMapUpsert(map);
    await reloadProject();
  },

  async removeSongCueMap(mapId) {
    await api.songCueMapRemove(mapId);
    await reloadProject();
  },

  async triggerSongCueMap(libraryItemId, sceneId, transitionEvent) {
    const actions = await api.songCueMapTrigger({
      libraryItemId,
      sceneId,
      transitionEvent: transitionEvent ?? "scene_change",
    });
    await reloadProject();
    return actions;
  },

  async upsertDeviceBinding(binding) {
    await api.deviceBindingUpsert(binding);
    await reloadProject();
  },

  async removeDeviceBinding(bindingId) {
    await api.deviceBindingRemove(bindingId);
    await reloadProject();
  },

  async testDeviceBinding(bindingId) {
    const payload = await api.deviceBindingTest(bindingId);
    await reloadProject();
    return payload;
  },

  async upsertFallbackProfile(profile) {
    await api.fallbackProfileUpsert(profile);
    await reloadProject();
  },

  async removeFallbackProfile(profileId) {
    await api.fallbackProfileRemove(profileId);
    await reloadProject();
  },

  async applyFallbackProfile(profileId) {
    await api.fallbackProfileApply(profileId);
    await reloadProject();
  },

  async setBlackout(enabled, fadeMs) {
    const safety = await api.safetyBlackoutSet(enabled, fadeMs);
    await reloadProject();
    return safety;
  },

  async panic(action) {
    const safety = await api.safetyPanic(action);
    await reloadProject();
    return safety;
  },

  async resetSafety() {
    const safety = await api.safetyReset();
    await reloadProject();
    return safety;
  },
}));
