/**
 * Metronome settings. The actual audio is driven by MetronomeService in services/metronome.ts.
 * This store provides settings; components subscribe to toggle/configure.
 */

import { create } from "zustand";

interface MetronomeState {
  enabled: boolean;
  /** How many bars to count in before recording starts. 0 = no count-in. */
  countInBars: number;
  volume: number;
  toggle(): void;
  setCountIn(bars: number): void;
  setVolume(v: number): void;
}

export const useMetronomeStore = create<MetronomeState>((set) => ({
  enabled: false,
  countInBars: 0,
  volume: 0.7,

  toggle() {
    set((s) => ({ enabled: !s.enabled }));
  },

  setCountIn(bars) {
    set({ countInBars: Math.max(0, Math.min(bars, 8)) });
  },

  setVolume(v) {
    set({ volume: Math.max(0, Math.min(v, 1)) });
  },
}));
