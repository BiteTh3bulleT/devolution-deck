import { create } from "zustand";
import * as api from "../api";
import type {
  BrandingConfig,
  LightingCueBinding,
  PerformanceMacro,
  PerformanceModeState,
  SceneTrigger,
  ShowCue,
  VisualSyncState,
} from "../types";
import { useProjectStore } from "./projectStore";

function ensureProject() {
  const project = useProjectStore.getState().project;
  if (!project) {
    throw new Error("No project loaded");
  }
  return project;
}

interface PerformanceStoreState {
  updateMode: (patch: Partial<PerformanceModeState>) => Promise<void>;
  upsertMacro: (macroConfig: PerformanceMacro) => Promise<void>;
  removeMacro: (macroId: string) => Promise<void>;
  triggerMacro: (macroId: string) => Promise<void>;
  upsertSceneTrigger: (trigger: SceneTrigger) => Promise<void>;
  removeSceneTrigger: (triggerId: string) => Promise<void>;
  upsertShowCue: (cue: ShowCue) => Promise<void>;
  removeShowCue: (cueId: string) => Promise<void>;
  previewShowCue: (cueId: string) => Promise<string>;
  upsertLightingBinding: (binding: LightingCueBinding) => Promise<void>;
  removeLightingBinding: (bindingId: string) => Promise<void>;
  updateVisualSync: (patch: Partial<VisualSyncState>) => Promise<void>;
  updateBranding: (patch: Partial<BrandingConfig>) => Promise<void>;
}

export const usePerformanceStore = create<PerformanceStoreState>(() => ({
  async updateMode(patch) {
    const project = ensureProject();
    const mode = { ...project.performance_mode, ...patch };
    await api.performanceModeUpdate(mode);
    await useProjectStore.getState().load();
  },

  async upsertMacro(macroConfig) {
    await api.performanceMacroUpsert(macroConfig);
    await useProjectStore.getState().load();
  },

  async removeMacro(macroId) {
    await api.performanceMacroRemove(macroId);
    await useProjectStore.getState().load();
  },

  async triggerMacro(macroId) {
    await api.performanceMacroTrigger(macroId);
    await useProjectStore.getState().load();
  },

  async upsertSceneTrigger(trigger) {
    await api.sceneTriggerUpsert(trigger);
    await useProjectStore.getState().load();
  },

  async removeSceneTrigger(triggerId) {
    await api.sceneTriggerRemove(triggerId);
    await useProjectStore.getState().load();
  },

  async upsertShowCue(cue) {
    await api.showCueUpsert(cue);
    await useProjectStore.getState().load();
  },

  async removeShowCue(cueId) {
    await api.showCueRemove(cueId);
    await useProjectStore.getState().load();
  },

  async previewShowCue(cueId) {
    return api.showCuePreview(cueId);
  },

  async upsertLightingBinding(binding) {
    await api.lightingCueBindingUpsert(binding);
    await useProjectStore.getState().load();
  },

  async removeLightingBinding(bindingId) {
    await api.lightingCueBindingRemove(bindingId);
    await useProjectStore.getState().load();
  },

  async updateVisualSync(patch) {
    const project = ensureProject();
    await api.visualSyncUpdate({ ...project.visual_sync, ...patch });
    await useProjectStore.getState().load();
  },

  async updateBranding(patch) {
    const project = ensureProject();
    const branding = {
      ...project.branding,
      ...patch,
      theme: {
        ...project.branding.theme,
        ...(patch.theme ?? {}),
      },
      performance_palette: patch.performance_palette ?? project.branding.performance_palette,
    };
    await api.brandingUpdate(branding);
    await useProjectStore.getState().load();
  },
}));
