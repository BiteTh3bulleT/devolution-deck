/**
 * MIDI editor state: open clip, note selection, piano roll view.
 * Mutations here are local-only; persist via midiClipUpdate API call.
 */

import { create } from "zustand";
import type { MidiClip, MidiNote, QuantizeDivision } from "../types";
import * as api from "../api";
import { useProjectStore } from "./projectStore";

interface MidiStoreState {
  /** The clip currently open in the piano roll. null = piano roll hidden. */
  openClip: { trackId: string; clip: MidiClip } | null;
  /** The track currently open in the drum sequencer. null = sequencer hidden. */
  openDrumTrack: import("../types").Track | null;
  selectedNoteIds: Set<string>;
  quantize: QuantizeDivision;
  /** Pixels per tick for piano roll horizontal zoom. */
  pxPerTick: number;
  scrollX: number;
  scrollY: number;
  /** Interaction mode in the piano roll. */
  editMode: "select" | "draw" | "erase";
}

interface MidiStoreActions {
  openPianoRoll(trackId: string, clip: MidiClip): void;
  closePianoRoll(): void;
  openDrumSequencer(track: import("../types").Track): void;
  closeDrumSequencer(): void;
  setSelectedNotes(ids: string[]): void;
  toggleNoteSelected(id: string): void;
  clearSelection(): void;
  /** Add a note locally and persist to backend. */
  addNote(note: MidiNote): Promise<void>;
  /** Update one or more notes locally and persist. */
  updateNote(id: string, patch: Partial<MidiNote>): Promise<void>;
  /** Delete notes by id list and persist. */
  deleteNotes(ids: string[]): Promise<void>;
  setQuantize(q: QuantizeDivision): void;
  setPxPerTick(v: number): void;
  setScrollX(v: number): void;
  setScrollY(v: number): void;
  setEditMode(m: "select" | "draw" | "erase"): void;
}

export const useMidiStore = create<MidiStoreState & MidiStoreActions>((set, get) => ({
  openClip: null,
  openDrumTrack: null,
  selectedNoteIds: new Set(),
  quantize: "1/16",
  pxPerTick: 0.1,
  scrollX: 0,
  scrollY: 0,
  editMode: "draw",

  openPianoRoll(trackId, clip) {
    set({ openClip: { trackId, clip }, selectedNoteIds: new Set() });
  },

  closePianoRoll() {
    set({ openClip: null, selectedNoteIds: new Set() });
  },

  openDrumSequencer(track) {
    set({ openDrumTrack: track });
  },

  closeDrumSequencer() {
    set({ openDrumTrack: null });
  },

  setSelectedNotes(ids) {
    set({ selectedNoteIds: new Set(ids) });
  },

  toggleNoteSelected(id) {
    const s = new Set(get().selectedNoteIds);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    set({ selectedNoteIds: s });
  },

  clearSelection() {
    set({ selectedNoteIds: new Set() });
  },

  async addNote(note) {
    const { openClip } = get();
    if (!openClip) return;
    const updated: MidiClip = {
      ...openClip.clip,
      notes: [...openClip.clip.notes, note],
    };
    set({ openClip: { trackId: openClip.trackId, clip: updated } });
    try {
      await api.midiClipUpdate(openClip.trackId, updated);
      await useProjectStore.getState().load();
    } catch (e) {
      console.error("addNote persist failed", e);
    }
  },

  async updateNote(id, patch) {
    const { openClip } = get();
    if (!openClip) return;
    const updated: MidiClip = {
      ...openClip.clip,
      notes: openClip.clip.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    };
    set({ openClip: { trackId: openClip.trackId, clip: updated } });
    try {
      await api.midiClipUpdate(openClip.trackId, updated);
      await useProjectStore.getState().load();
    } catch (e) {
      console.error("updateNote persist failed", e);
    }
  },

  async deleteNotes(ids) {
    const { openClip } = get();
    if (!openClip) return;
    const idSet = new Set(ids);
    const updated: MidiClip = {
      ...openClip.clip,
      notes: openClip.clip.notes.filter((n) => !idSet.has(n.id)),
    };
    set({
      openClip: { trackId: openClip.trackId, clip: updated },
      selectedNoteIds: new Set(),
    });
    try {
      await api.midiClipUpdate(openClip.trackId, updated);
      await useProjectStore.getState().load();
    } catch (e) {
      console.error("deleteNotes persist failed", e);
    }
  },

  setQuantize(q) {
    set({ quantize: q });
  },

  setPxPerTick(v) {
    set({ pxPerTick: Math.max(0.02, Math.min(v, 2)) });
  },

  setScrollX(v) {
    set({ scrollX: Math.max(0, v) });
  },

  setScrollY(v) {
    set({ scrollY: Math.max(0, v) });
  },

  setEditMode(m) {
    set({ editMode: m });
  },
}));
