import { create } from "zustand";

/** Pixels per second of timeline (zoom). */
const DEFAULT_PPX = 80;

export type DeckMainView = "arrangement" | "session" | "decks" | "performance";
export type UtilityTab =
  | "inspector"
  | "mixer"
  | "automation"
  | "templates"
  | "plugins"
  | "render"
  | "comping"
  | "system"
  | "shortcuts"
  | "assistant"
  | "dashboard"
  | "performance"
  | "show"
  | "branding"
  | "ops";

interface ViewState {
  /** Timeline pixels per second. */
  pixelsPerSec: number;
  /** Horizontal scroll offset in pixels. */
  scrollLeft: number;
  /** Track header width in pixels. */
  trackHeaderWidth: number;
  /** Ruler height in pixels. */
  rulerHeight: number;
  /** Track row height in pixels. */
  trackHeight: number;
  /** Main center panel mode. */
  mainView: DeckMainView;
  /** Utility panel tab. */
  utilityTab: UtilityTab;
}

interface ViewActions {
  setPixelsPerSec: (v: number) => void;
  setScrollLeft: (v: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setMainView: (mode: DeckMainView) => void;
  setUtilityTab: (tab: UtilityTab) => void;
}

export const useViewStore = create<ViewState & ViewActions>((set) => ({
  pixelsPerSec: DEFAULT_PPX,
  scrollLeft: 0,
  trackHeaderWidth: 180,
  rulerHeight: 28,
  trackHeight: 72,
  mainView: "arrangement",
  utilityTab: "inspector",

  setPixelsPerSec(v) {
    set({ pixelsPerSec: Math.max(20, Math.min(500, v)) });
  },

  setScrollLeft(v) {
    set({ scrollLeft: Math.max(0, v) });
  },

  zoomIn() {
    set((s) => ({ pixelsPerSec: Math.min(500, s.pixelsPerSec * 1.2) }));
  },

  zoomOut() {
    set((s) => ({ pixelsPerSec: Math.max(20, s.pixelsPerSec / 1.2) }));
  },

  setMainView(mode) {
    set({ mainView: mode });
  },

  setUtilityTab(tab) {
    set({ utilityTab: tab });
  },
}));
