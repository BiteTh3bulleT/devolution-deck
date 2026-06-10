import { create } from "zustand";
import * as api from "../api";
import { useLoopStore } from "./loopStore";
import { useProjectStore } from "./projectStore";
import { metronomeService } from "../services/metronome";
import { midiSequencer } from "../services/midiSequencer";

const POSITION_POLL_MS = 50;

export type TransportStatus = "stopped" | "playing";

interface TransportState {
  status: TransportStatus;
  /** Timeline position in seconds (for display and playhead). */
  positionSecs: number;
  /** Whether we are currently polling backend for position. */
  _positionPollId: ReturnType<typeof setInterval> | null;
  /** Guard to prevent stacked loop seeks. */
  _loopSeeking: boolean;
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
  _loopSeeking: false,

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
    try {
      await api.playbackStop();
    } catch (e) {
      console.error("Stop failed", e);
    }
    metronomeService.stop();
    midiSequencer.stop();
    set({ status: "stopped", positionSecs: 0 });
  },

  setPositionSecs(secs) {
    set({ positionSecs: secs });
  },

  startPositionPoll() {
    get().stopPositionPoll();
    const id = setInterval(async () => {
      try {
        const playing = await api.playbackIsPlaying();
        if (!playing) {
          get().stopPositionPoll();
          set({ status: "stopped" });
          return;
        }
        const ms = await api.playbackPositionMs();
        const positionSecs = ms / 1000;
        set({ positionSecs });

        // Sync metronome and MIDI sequencer to current transport position
        const bpm = useProjectStore.getState().project?.bpm ?? 120;
        metronomeService.tick(positionSecs, bpm);
        midiSequencer.tick(positionSecs, bpm);

        // Loop region enforcement (with seeking guard to prevent stacked seeks)
        const { region } = useLoopStore.getState();
        if (region?.enabled && positionSecs >= region.end_secs && !get()._loopSeeking) {
          set({ _loopSeeking: true });
          try {
            await api.playbackSeek(region.start_secs);
          } finally {
            set({ _loopSeeking: false });
          }
        }
      } catch (e) {
        console.error("Position poll failed", e);
        get().stopPositionPoll();
        set({ status: "stopped" });
      }
    }, POSITION_POLL_MS);
    set({ _positionPollId: id });
  },

  stopPositionPoll() {
    const id = get()._positionPollId;
    if (id) clearInterval(id);
    set({ _positionPollId: null, _loopSeeking: false });
  },
}));
