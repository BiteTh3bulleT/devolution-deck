import { create } from "zustand";
import * as api from "../api";

const POSITION_POLL_MS = 50;

export type TransportStatus = "stopped" | "playing";

interface TransportState {
  status: TransportStatus;
  /** Timeline position in seconds (for display and playhead). */
  positionSecs: number;
  /** Whether we are currently polling backend for position. */
  _positionPollId: ReturnType<typeof setInterval> | null;
}

interface TransportActions {
  play: (payload: { path: string; offset_secs: number; duration_secs: number }) => Promise<void>;
  stop: () => Promise<void>;
  setPositionSecs: (secs: number) => void;
  startPositionPoll: () => void;
  stopPositionPoll: () => void;
}

export const useTransportStore = create<TransportState & TransportActions>((set, get) => ({
  status: "stopped",
  positionSecs: 0,
  _positionPollId: null,

  async play(payload) {
    try {
      await api.playbackPlay(payload);
      set({ status: "playing" });
      get().startPositionPoll();
    } catch (e) {
      console.error("Play failed", e);
      set({ status: "stopped" });
    }
  },

  async stop() {
    get().stopPositionPoll();
    await api.playbackStop();
    set({ status: "stopped", positionSecs: 0 });
  },

  setPositionSecs(secs) {
    set({ positionSecs: secs });
  },

  startPositionPoll() {
    get().stopPositionPoll();
    const id = setInterval(async () => {
      const playing = await api.playbackIsPlaying();
      if (!playing) {
        get().stopPositionPoll();
        set({ status: "stopped" });
        return;
      }
      const ms = await api.playbackPositionMs();
      set({ positionSecs: ms / 1000 });
    }, POSITION_POLL_MS);
    set({ _positionPollId: id });
  },

  stopPositionPoll() {
    const id = get()._positionPollId;
    if (id) clearInterval(id);
    set({ _positionPollId: null });
  },
}));
