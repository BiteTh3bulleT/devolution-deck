import { create } from "zustand";
import * as api from "../api";
import type {
  Crate,
  CrossfaderSide,
  DeckEventBinding,
  DeckSceneLink,
  DeckSyncState,
  LibraryItem,
  PerformancePad,
  SamplerSlot,
  Setlist,
  ShowTrigger,
} from "../types";
import { v4 } from "../utils/uuid";
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

interface DjStoreState {
  selectedCrateId: string | null;
  selectedSetlistId: string | null;

  setSelectedCrateId: (crateId: string | null) => void;
  setSelectedSetlistId: (setlistId: string | null) => void;

  analyzeAsset: (mediaAssetId: string) => Promise<void>;
  analyzeAllAssets: () => Promise<void>;
  updateLibraryItem: (item: LibraryItem) => Promise<void>;

  createCrate: (name: string) => Promise<void>;
  removeCrate: (crateId: string) => Promise<void>;
  addItemToCrate: (crateId: string, itemId: string) => Promise<void>;
  removeItemFromCrate: (crateId: string, itemId: string) => Promise<void>;

  loadDeckTrack: (deckId: string, libraryItemId: string) => Promise<void>;
  setDeckPlaying: (deckId: string, playing: boolean) => Promise<void>;
  seekDeck: (deckId: string, positionSecs: number) => Promise<void>;
  turntableNudge: (deckId: string, deltaBeats: number) => Promise<void>;
  turntableScratch: (deckId: string, deltaSecs: number, friction?: number) => Promise<void>;
  configureTurntable: (deckId: string, vinylMode: boolean, jogSensitivity: number) => Promise<void>;
  addHotCue: (deckId: string, positionSecs: number) => Promise<void>;
  triggerHotCue: (deckId: string, cueId: string) => Promise<void>;
  removeHotCue: (deckId: string, cueId: string) => Promise<void>;
  setDeckLoop: (deckId: string, startSecs: number, endSecs: number, quantizeBeats: number) => Promise<void>;
  clearDeckLoop: (deckId: string) => Promise<void>;

  updateDeckSync: (patch: Partial<DeckSyncState>) => Promise<void>;
  applyDeckSync: (masterDeckId: string, followerDeckId: string) => Promise<void>;
  setCrossfaderPosition: (position: number) => Promise<void>;
  setCrossfaderCurve: (curve: number) => Promise<void>;
  bindTrackToCrossfader: (trackId: string, side: CrossfaderSide) => Promise<void>;

  upsertSamplerSlot: (slot: SamplerSlot) => Promise<void>;
  removeSamplerSlot: (slotId: string) => Promise<void>;
  upsertPerformancePad: (pad: PerformancePad) => Promise<void>;
  removePerformancePad: (padId: string) => Promise<void>;
  triggerPerformancePad: (padId: string) => Promise<void>;

  upsertSetlist: (setlist: Setlist) => Promise<void>;
  removeSetlist: (setlistId: string) => Promise<void>;
  setActiveSetlist: (setlistId?: string) => Promise<void>;
  markSetlistEntryPlayed: (setlistId: string, entryId: string, played: boolean) => Promise<void>;

  upsertShowTrigger: (trigger: ShowTrigger) => Promise<void>;
  removeShowTrigger: (triggerId: string) => Promise<void>;
  executeShowTrigger: (triggerId: string) => Promise<string>;

  upsertDeckEventBinding: (binding: DeckEventBinding) => Promise<void>;
  removeDeckEventBinding: (bindingId: string) => Promise<void>;

  upsertDeckSceneLink: (link: DeckSceneLink) => Promise<void>;
  removeDeckSceneLink: (linkId: string) => Promise<void>;
  coordinateScene: (sceneId: string) => Promise<string[]>;
}

export const useDjStore = create<DjStoreState>((set) => ({
  selectedCrateId: null,
  selectedSetlistId: null,

  setSelectedCrateId(crateId) {
    set({ selectedCrateId: crateId });
  },

  setSelectedSetlistId(setlistId) {
    set({ selectedSetlistId: setlistId });
  },

  async analyzeAsset(mediaAssetId) {
    await api.libraryItemAnalyzeUpsert(mediaAssetId);
    await reloadProject();
  },

  async analyzeAllAssets() {
    const project = ensureProject();
    const indexedAssetIds = new Set(project.library_items.map((item) => item.media_asset_id));
    const pendingAssets = project.media.filter((asset) => !indexedAssetIds.has(asset.id));
    for (const asset of pendingAssets) {
      await api.libraryItemAnalyzeUpsert(asset.id);
    }
    await reloadProject();
  },

  async updateLibraryItem(item) {
    await api.libraryItemUpdate(item);
    await reloadProject();
  },

  async createCrate(name) {
    const crateState: Crate = {
      id: v4(),
      name: name.trim() || "New Crate",
      color_hex: undefined,
      item_ids: [],
      smart_query: undefined,
      created_unix_ms: Date.now(),
    };
    await api.crateUpsert(crateState);
    await reloadProject();
    set({ selectedCrateId: crateState.id });
  },

  async removeCrate(crateId) {
    await api.crateRemove(crateId);
    await reloadProject();
    set((state) => ({
      selectedCrateId: state.selectedCrateId === crateId ? null : state.selectedCrateId,
    }));
  },

  async addItemToCrate(crateId, itemId) {
    await api.crateItemAdd(crateId, itemId);
    await reloadProject();
  },

  async removeItemFromCrate(crateId, itemId) {
    await api.crateItemRemove(crateId, itemId);
    await reloadProject();
  },

  async loadDeckTrack(deckId, libraryItemId) {
    await api.deckLoadTrack(deckId, libraryItemId);
    await reloadProject();
  },

  async setDeckPlaying(deckId, playing) {
    await api.deckSetPlaying(deckId, playing);
    await reloadProject();
  },

  async seekDeck(deckId, positionSecs) {
    await api.deckSeekPosition(deckId, positionSecs);
    await reloadProject();
  },

  async turntableNudge(deckId, deltaBeats) {
    await api.deckTurntableNudge(deckId, deltaBeats);
    await reloadProject();
  },

  async turntableScratch(deckId, deltaSecs, friction) {
    await api.deckTurntableScratch(deckId, deltaSecs, friction);
    await reloadProject();
  },

  async configureTurntable(deckId, vinylMode, jogSensitivity) {
    await api.deckTurntableConfigure(deckId, vinylMode, jogSensitivity);
    await reloadProject();
  },

  async addHotCue(deckId, positionSecs) {
    await api.deckHotCueSet(deckId, "Cue", positionSecs, "#38d7ff");
    await reloadProject();
  },

  async triggerHotCue(deckId, cueId) {
    await api.deckHotCueTrigger(deckId, cueId);
    await reloadProject();
  },

  async removeHotCue(deckId, cueId) {
    await api.deckHotCueRemove(deckId, cueId);
    await reloadProject();
  },

  async setDeckLoop(deckId, startSecs, endSecs, quantizeBeats) {
    await api.deckLoopSet(deckId, startSecs, endSecs, quantizeBeats);
    await reloadProject();
  },

  async clearDeckLoop(deckId) {
    await api.deckLoopClear(deckId);
    await reloadProject();
  },

  async updateDeckSync(patch) {
    const project = ensureProject();
    await api.deckSyncUpdate({ ...project.deck_sync, ...patch });
    await reloadProject();
  },

  async applyDeckSync(masterDeckId, followerDeckId) {
    await api.deckSyncApply(masterDeckId, followerDeckId);
    await reloadProject();
  },

  async setCrossfaderPosition(position) {
    const project = ensureProject();
    await api.crossfaderUpdate({ ...project.crossfader, position });
    await reloadProject();
  },

  async setCrossfaderCurve(curve) {
    const project = ensureProject();
    await api.crossfaderUpdate({ ...project.crossfader, curve });
    await reloadProject();
  },

  async bindTrackToCrossfader(trackId, side) {
    await api.crossfaderBindTrack(trackId, side);
    await reloadProject();
  },

  async upsertSamplerSlot(slot) {
    await api.samplerSlotUpsert(slot);
    await reloadProject();
  },

  async removeSamplerSlot(slotId) {
    await api.samplerSlotRemove(slotId);
    await reloadProject();
  },

  async upsertPerformancePad(pad) {
    await api.performancePadUpsert(pad);
    await reloadProject();
  },

  async removePerformancePad(padId) {
    await api.performancePadRemove(padId);
    await reloadProject();
  },

  async triggerPerformancePad(padId) {
    await api.performancePadTrigger(padId);
    await reloadProject();
  },

  async upsertSetlist(setlist) {
    await api.setlistUpsert(setlist);
    await reloadProject();
    set({ selectedSetlistId: setlist.id });
  },

  async removeSetlist(setlistId) {
    await api.setlistRemove(setlistId);
    await reloadProject();
    set((state) => ({
      selectedSetlistId: state.selectedSetlistId === setlistId ? null : state.selectedSetlistId,
    }));
  },

  async setActiveSetlist(setlistId) {
    await api.setlistSetActive(setlistId);
    await reloadProject();
    set({ selectedSetlistId: setlistId ?? null });
  },

  async markSetlistEntryPlayed(setlistId, entryId, played) {
    await api.setlistEntryMarkPlayed(setlistId, entryId, played);
    await reloadProject();
  },

  async upsertShowTrigger(trigger) {
    await api.showTriggerUpsert(trigger);
    await reloadProject();
  },

  async removeShowTrigger(triggerId) {
    await api.showTriggerRemove(triggerId);
    await reloadProject();
  },

  async executeShowTrigger(triggerId) {
    return api.showTriggerExecute(triggerId);
  },

  async upsertDeckEventBinding(binding) {
    await api.deckEventBindingUpsert(binding);
    await reloadProject();
  },

  async removeDeckEventBinding(bindingId) {
    await api.deckEventBindingRemove(bindingId);
    await reloadProject();
  },

  async upsertDeckSceneLink(link) {
    await api.deckSceneLinkUpsert(link);
    await reloadProject();
  },

  async removeDeckSceneLink(linkId) {
    await api.deckSceneLinkRemove(linkId);
    await reloadProject();
  },

  async coordinateScene(sceneId) {
    const actions = await api.deckSceneCoordinate(sceneId);
    await reloadProject();
    return actions;
  },
}));
