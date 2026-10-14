import { create } from "zustand";
import * as api from "../api";
import { useRecordingStore } from "./recordingStore";
import { useProjectStore } from "./projectStore";
import { metronomeService } from "../services/metronome";
import { midiSequencer } from "../services/midiSequencer";
export type TransportStatus = "stopped" | "starting" | "playing";
let generation = 0;
interface TransportStore {
  status: TransportStatus;
  positionSecs: number;
  _positionPollId: ReturnType<typeof setInterval> | null;
  play: (startSecs?: number) => Promise<void>;
  stop: () => Promise<void>;
  setPositionSecs: (secs: number) => void;
  startPositionPoll: () => void;
  stopPositionPoll: () => void;
}
export const useTransportStore = create<TransportStore>((set, get) => ({
  status: "stopped", positionSecs: 0, _positionPollId: null,
  async play(startSecs) {
    if (get().status !== "stopped") return;
    const ticket = ++generation;
    const projectId = useProjectStore.getState().project?.id;
    const position = startSecs ?? get().positionSecs;
    set({ status: "starting" });
    try {
      await api.playbackPlayArrangement(position);
      if (ticket !== generation) return;
      if (projectId !== useProjectStore.getState().project?.id) { set({ status: "stopped" }); return; }
      set({ status: "playing", positionSecs: position });
      get().startPositionPoll();
    } catch (error) {
      if (ticket !== generation) return;
      set({ status: "stopped" });
      useProjectStore.setState({ error: `Playback failed: ${error}` });
    }
  },
  async stop() {
    ++generation;
    get().stopPositionPoll();
    metronomeService.stop(); midiSequencer.stop();
    set({ status: "stopped", positionSecs: 0 });
    // Dispatch audio Stop immediately; writing a recorded take can take longer.
    const audioStop = api.playbackStop();
    const results = await Promise.allSettled([audioStop, useRecordingStore.getState().stopRecording()]);
    for (const result of results) if (result.status === "rejected") {
      useProjectStore.setState({ error: `Stop failed: ${result.reason}` });
    }
  },
  setPositionSecs(positionSecs) { set({ positionSecs }); },
  startPositionPoll() {
    get().stopPositionPoll();
    const ticket = generation;
    let pending = false;
    const current = () => ticket === generation && get().status === "playing";
    const id = setInterval(async () => {
      if (pending || !current()) return;
      pending = true;
      try {
        const playing = await api.playbackIsPlaying();
        if (!current()) return;
        if (!playing) {
          get().stopPositionPoll(); metronomeService.stop(); midiSequencer.stop();
          set({ status: "stopped" }); return;
        }
        const ms = await api.playbackPositionMs();
        if (!current()) return;
        const positionSecs = ms / 1000;
        set({ positionSecs });
        const bpm = useProjectStore.getState().project?.bpm ?? 120;
        metronomeService.tick(positionSecs, bpm); midiSequencer.tick(positionSecs, bpm);
      } catch (error) {
        if (!current()) return;
        get().stopPositionPoll(); metronomeService.stop(); midiSequencer.stop();
        set({ status: "stopped" });
        useProjectStore.setState({ error: `Position poll failed: ${error}` });
      } finally { pending = false; }
    }, 50);
    set({ _positionPollId: id });
  },
  stopPositionPoll() {
    const id = get()._positionPollId;
    if (id !== null) clearInterval(id);
    set({ _positionPollId: null });
  },
}));
