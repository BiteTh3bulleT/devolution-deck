import { create } from "zustand";
import * as api from "../api";
import { useRecordingStore } from "./recordingStore";
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
  play: (startSecs?: number) => Promise<void>;
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

  async play(startSecs) {
    try {
      const timelineStart = startSecs ?? get().positionSecs;
      await api.playbackPlayArrangement(timelineStart);
      set({ positionSecs: timelineStart, status: "playing" });
      get().startPositionPoll();
    } catch (e) {
      useProjectStore.setState({ error: `Playback failed: ${e}` });
      set({ status: "stopped" });
    }
  },

  async stop() {
    get().stopPositionPoll();
    await useRecordingStore.getState().stopRecording();
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
          metronomeService.stop();
          midiSequencer.stop();
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
