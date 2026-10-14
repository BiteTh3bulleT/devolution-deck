/**
 * Audio recording state. Coordinates with Rust recording commands.
 */

import { create } from "zustand";
import type { RecordingStatus } from "../types";
import * as api from "../api";
import { useProjectStore } from "./projectStore";
import { useTransportStore } from "./transportStore";
import { useMetronomeStore } from "./metronomeStore";
import { join, documentDir } from "@tauri-apps/api/path";

interface RecordingState {
  status: RecordingStatus;
  targetTrackId: string | null;
  recordStartSecs: number;
  latencyCompensationSecs: number;
  inputDevices: string[];
  selectedDevice: string | null;
  error: string | null;
  /** Path to temp WAV file for cleanup on error/cancel. */
  _tmpPath: string | null;

  fetchInputDevices(): Promise<void>;
  setDevice(name: string): void;
  startRecording(trackId: string, positionSecs: number): Promise<void>;
  stopRecording(): Promise<void>;
  clearError(): void;
}

let generation = 0;
let captureStart: Promise<void> | null = null;
let countInTimer: ReturnType<typeof setTimeout> | null = null;

export const useRecordingStore = create<RecordingState>((set, get) => ({
  status: "idle",
  targetTrackId: null,
  recordStartSecs: 0,
  latencyCompensationSecs: 0,
  inputDevices: [],
  selectedDevice: null,
  error: null,
  _tmpPath: null,

  async fetchInputDevices() {
    try {
      const devices = await api.recordingListDevices();
      set({ inputDevices: devices, selectedDevice: devices[0] ?? null });
    } catch (e) {
      set({ error: `Could not list devices: ${e}` });
    }
  },

  setDevice(name) {
    set({ selectedDevice: name });
  },

  async startRecording(trackId, positionSecs) {
    if (get().status !== "idle") return;
    const request = ++generation;
    const { countInBars } = useMetronomeStore.getState();
    const project = useProjectStore.getState().project;
    if (!project) return;

    const bpm = project.bpm;
    const countInSecs = countInBars > 0 ? (countInBars * 4 * 60) / bpm : 0;

    const targetBufferMs = Math.max(8, Math.min(2048, Math.round(project.monitoring.target_buffer_ms || 64)));
    const latencyCompensationSecs = Math.max(
      0,
      (project.monitoring.latency_compensation_ms || 0) / 1000
    );

    set({
      targetTrackId: trackId,
      recordStartSecs: positionSecs,
      latencyCompensationSecs,
      error: null,
    });

    const doStart = async () => {
      countInTimer = null;
      try {
        const tmpPath = await join(await documentDir(), "DEVOLUTION DECK", "Recordings", `take_${Date.now()}.wav`);
        if (request !== generation) return;
        if (useProjectStore.getState().project?.id !== project.id) { set({ status: "idle", targetTrackId: null }); return; }
        const transport = useTransportStore.getState();
        if (transport.status === "playing") set({ recordStartSecs: transport.positionSecs });
        set({ status: "starting", _tmpPath: tmpPath });
        captureStart = api.recordingStart(get().selectedDevice, tmpPath, targetBufferMs);
        await captureStart;
        if (request === generation) set({ status: "recording" });
      } catch (e) {
        if (request === generation) set({ status: "idle", error: `Recording failed: ${e}`, _tmpPath: null });
      } finally {
        captureStart = null;
      }
    };

    if (countInSecs > 0) {
      set({ status: "count_in" });
      countInTimer = setTimeout(doStart, countInSecs * 1000);
    } else {
      set({ status: "count_in" });
      await doStart();
    }
  },

  async stopRecording() {
    ++generation;
    if (get().status === "count_in") {
      if (countInTimer) clearTimeout(countInTimer);
      countInTimer = null;
      // Cancelled during count-in — no temp file to clean up
      set({ status: "idle", targetTrackId: null, _tmpPath: null });
      return;
    }
    const { status, recordStartSecs, latencyCompensationSecs } = get();
    if (status !== "recording" && status !== "starting") return;
    set({ status: "stopping" });
    try {
      if (captureStart) await captureStart;
      // Backend stops capture and atomically places the recording on the
      // armed audio track as media asset + timeline clip.
      await api.recordingStopToTimeline(
        Math.max(0, recordStartSecs - latencyCompensationSecs)
      );
      await useProjectStore.getState().load();
    } catch (e) {
      set({ error: `Stop recording failed: ${e}` });
    }
    set({ status: "idle", targetTrackId: null, latencyCompensationSecs: 0, _tmpPath: null });
  },

  clearError() {
    set({ error: null });
  },
} as RecordingState));
