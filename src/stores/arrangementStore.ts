import { create } from "zustand";

interface ArrangementStoreState {
  selectedAudioClip: { trackId: string; clipId: string } | null;
  selectAudioClip: (trackId: string, clipId: string) => void;
  clearAudioClipSelection: () => void;
}

export const useArrangementStore = create<ArrangementStoreState>((set) => ({
  selectedAudioClip: null,
  selectAudioClip(trackId, clipId) {
    set({ selectedAudioClip: { trackId, clipId } });
  },
  clearAudioClipSelection() {
    set({ selectedAudioClip: null });
  },
}));
