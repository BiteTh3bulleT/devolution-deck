import { create } from "zustand";
import * as api from "../api";
import type { Project, ShortcutBinding } from "../types";
import { v4 } from "../utils/uuid";
import { useProjectStore } from "./projectStore";

export type ShortcutActionId =
  | "transport_play_stop"
  | "transport_stop"
  | "transport_to_start"
  | "project_save"
  | "track_add_audio"
  | "track_add_midi"
  | "view_arrangement"
  | "view_session"
  | "view_decks"
  | "view_performance"
  | "utility_mixer"
  | "utility_plugins"
  | "utility_render"
  | "utility_dashboard"
  | "utility_ops"
  | "timeline_zoom_in"
  | "timeline_zoom_out"
  | "clip_delete_selected";

export interface ShortcutActionDefinition {
  id: ShortcutActionId;
  label: string;
  description: string;
}

export const SHORTCUT_ACTIONS: ShortcutActionDefinition[] = [
  { id: "transport_play_stop", label: "Play/Stop", description: "Toggle transport playback." },
  { id: "transport_stop", label: "Stop", description: "Stop transport and return to idle." },
  { id: "transport_to_start", label: "To Start", description: "Move playhead to project start." },
  { id: "project_save", label: "Save", description: "Save project to current path." },
  { id: "track_add_audio", label: "Add Audio Track", description: "Create a new audio track." },
  { id: "track_add_midi", label: "Add MIDI Track", description: "Create a new MIDI track." },
  { id: "view_arrangement", label: "Arrangement View", description: "Switch center view to arrangement." },
  { id: "view_session", label: "Session View", description: "Switch center view to session launcher." },
  { id: "view_decks", label: "Deck View", description: "Switch center view to dual deck mode." },
  { id: "view_performance", label: "Performance View", description: "Switch center view to stage mode." },
  { id: "utility_mixer", label: "Open Mixer", description: "Open mixer tab in utility panel." },
  { id: "utility_plugins", label: "Open Plugins", description: "Open plugins tab in utility panel." },
  { id: "utility_render", label: "Open Render", description: "Open render tab in utility panel." },
  { id: "utility_dashboard", label: "Open Dashboard", description: "Open producer dashboard tab." },
  { id: "utility_ops", label: "Open Ops", description: "Open release operations tab." },
  { id: "timeline_zoom_in", label: "Zoom In", description: "Increase timeline zoom." },
  { id: "timeline_zoom_out", label: "Zoom Out", description: "Decrease timeline zoom." },
  { id: "clip_delete_selected", label: "Delete Clip", description: "Delete selected arrangement audio clip." },
];

function keyLabel(key: string): string {
  const lower = key.toLowerCase();
  if (lower === " ") return "space";
  if (lower === "arrowleft") return "left";
  if (lower === "arrowright") return "right";
  if (lower === "arrowup") return "up";
  if (lower === "arrowdown") return "down";
  return lower;
}

function eventKey(event: KeyboardEvent): string {
  return keyLabel(event.key);
}

export function buildDefaultShortcutBindings(): ShortcutBinding[] {
  return [
    {
      id: v4(),
      action_id: "transport_play_stop",
      key: "space",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
      enabled: true,
    },
    {
      id: v4(),
      action_id: "transport_stop",
      key: "k",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
      enabled: true,
    },
    {
      id: v4(),
      action_id: "transport_to_start",
      key: "home",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
      enabled: true,
    },
    {
      id: v4(),
      action_id: "project_save",
      key: "s",
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
      enabled: true,
    },
    {
      id: v4(),
      action_id: "track_add_audio",
      key: "t",
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
      enabled: true,
    },
    {
      id: v4(),
      action_id: "track_add_midi",
      key: "t",
      ctrl: true,
      alt: false,
      shift: true,
      meta: false,
      enabled: true,
    },
    {
      id: v4(),
      action_id: "view_arrangement",
      key: "1",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
      enabled: true,
    },
    {
      id: v4(),
      action_id: "view_session",
      key: "2",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
      enabled: true,
    },
    {
      id: v4(),
      action_id: "view_decks",
      key: "3",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
      enabled: true,
    },
    {
      id: v4(),
      action_id: "view_performance",
      key: "4",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
      enabled: true,
    },
    {
      id: v4(),
      action_id: "utility_mixer",
      key: "m",
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
      enabled: true,
    },
    {
      id: v4(),
      action_id: "utility_plugins",
      key: "p",
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
      enabled: true,
    },
    {
      id: v4(),
      action_id: "utility_render",
      key: "e",
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
      enabled: true,
    },
    {
      id: v4(),
      action_id: "utility_dashboard",
      key: "d",
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
      enabled: true,
    },
    {
      id: v4(),
      action_id: "utility_ops",
      key: "o",
      ctrl: true,
      alt: false,
      shift: true,
      meta: false,
      enabled: true,
    },
    {
      id: v4(),
      action_id: "timeline_zoom_in",
      key: "=",
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
      enabled: true,
    },
    {
      id: v4(),
      action_id: "timeline_zoom_out",
      key: "-",
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
      enabled: true,
    },
    {
      id: v4(),
      action_id: "clip_delete_selected",
      key: "delete",
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
      enabled: true,
    },
  ];
}

function isEqualBinding(a: ShortcutBinding, b: ShortcutBinding): boolean {
  return (
    a.action_id === b.action_id &&
    a.key === b.key &&
    a.ctrl === b.ctrl &&
    a.alt === b.alt &&
    a.shift === b.shift &&
    a.meta === b.meta &&
    a.enabled === b.enabled
  );
}

function matchesEvent(binding: ShortcutBinding, event: KeyboardEvent): boolean {
  if (!binding.enabled) return false;
  return (
    keyLabel(binding.key) === eventKey(event) &&
    binding.ctrl === event.ctrlKey &&
    binding.alt === event.altKey &&
    binding.shift === event.shiftKey &&
    binding.meta === event.metaKey
  );
}

function comboLabel(binding: ShortcutBinding): string {
  const mods: string[] = [];
  if (binding.ctrl) mods.push("Ctrl");
  if (binding.alt) mods.push("Alt");
  if (binding.shift) mods.push("Shift");
  if (binding.meta) mods.push("Meta");
  mods.push(keyLabel(binding.key).toUpperCase());
  return mods.join("+");
}

interface ShortcutStoreState {
  bindings: ShortcutBinding[];
  seededDefaults: boolean;
  hydrateFromProject: (project: Project | null) => void;
  ensureDefaultsPersisted: (project: Project | null) => Promise<void>;
  updateBinding: (bindingId: string, patch: Partial<ShortcutBinding>) => void;
  replaceBindings: (bindings: ShortcutBinding[]) => void;
  saveBindings: () => Promise<void>;
  matchActionFromEvent: (event: KeyboardEvent) => ShortcutActionId | null;
  formatBindingCombo: (binding: ShortcutBinding) => string;
}

export const useShortcutStore = create<ShortcutStoreState>((set, get) => ({
  bindings: buildDefaultShortcutBindings(),
  seededDefaults: false,

  hydrateFromProject(project) {
    if (!project) {
      set({ bindings: buildDefaultShortcutBindings(), seededDefaults: false });
      return;
    }
    const incoming = project.shortcuts.length > 0 ? project.shortcuts : buildDefaultShortcutBindings();
    set((state) => {
      const unchanged =
        state.bindings.length === incoming.length &&
        state.bindings.every((binding, idx) => isEqualBinding(binding, incoming[idx]));
      if (unchanged) {
        return {
          ...state,
          seededDefaults: project.shortcuts.length > 0,
        };
      }
      return {
        ...state,
        bindings: incoming,
        seededDefaults: project.shortcuts.length > 0,
      };
    });
  },

  async ensureDefaultsPersisted(project) {
    if (!project || project.shortcuts.length > 0 || get().seededDefaults) {
      return;
    }
    const defaults = buildDefaultShortcutBindings();
    await api.shortcutBindingsSet(defaults);
    set({ seededDefaults: true, bindings: defaults });
    await useProjectStore.getState().load();
  },

  updateBinding(bindingId, patch) {
    set((state) => ({
      bindings: state.bindings.map((binding) =>
        binding.id === bindingId ? { ...binding, ...patch, id: binding.id } : binding
      ),
    }));
  },

  replaceBindings(bindings) {
    set({ bindings });
  },

  async saveBindings() {
    const bindings = get().bindings;
    await api.shortcutBindingsSet(bindings);
    await useProjectStore.getState().load();
  },

  matchActionFromEvent(event) {
    const binding = get().bindings.find((candidate) => matchesEvent(candidate, event));
    if (!binding) return null;
    return binding.action_id as ShortcutActionId;
  },

  formatBindingCombo(binding) {
    return comboLabel(binding);
  },
}));
