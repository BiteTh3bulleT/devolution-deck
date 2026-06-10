/**
 * Loop region state. Syncs to backend project via loopRegionSet / loopRegionClear.
 */

import { create } from "zustand";
import type { LoopRegion } from "../types";
import * as api from "../api";
import { useProjectStore } from "./projectStore";

interface LoopState {
  region: LoopRegion | null;
  setRegion(r: LoopRegion): Promise<void>;
  clearRegion(): Promise<void>;
  toggleEnabled(): Promise<void>;
  /** Sync region from the loaded project (called after project load). */
  syncFromProject(region: LoopRegion | undefined): void;
}

export const useLoopStore = create<LoopState>((set, get) => ({
  region: null,

  async setRegion(r) {
    const previousRegion = get().region;
    set({ region: r });
    try {
      await api.loopRegionSet(r.start_secs, r.end_secs, r.enabled);
      await useProjectStore.getState().load();
    } catch (e) {
      set({ region: previousRegion });
      console.error("loopRegionSet failed", e);
    }
  },

  async clearRegion() {
    const previousRegion = get().region;
    set({ region: null });
    try {
      await api.loopRegionClear();
      await useProjectStore.getState().load();
    } catch (e) {
      set({ region: previousRegion });
      console.error("loopRegionClear failed", e);
    }
  },

  async toggleEnabled() {
    const r = get().region;
    if (!r) return;
    await get().setRegion({ ...r, enabled: !r.enabled });
  },

  syncFromProject(region) {
    set({ region: region ?? null });
  },
}));
