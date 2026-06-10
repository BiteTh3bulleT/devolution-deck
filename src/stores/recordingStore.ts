/**
 * Audio recording state. Coordinates with Rust recording commands.
 */

import { create } from "zustand";
import type { RecordingStatus } from "../types";
import * as api from "../api";
import { useProjectStore } from "./projectStore";
import { useMetronomeStore } from "./metronomeStore";
import { join, tempDir } from "@tauri-apps/api/path";

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
      const tmpPath = await join(await tempDir(), `devoDeck_rec_${Date.now()}.wav`);
      set({ status: "recording", _tmpPath: tmpPath });
      try {
        await api.recordingStart(get().selectedDevice, tmpPath, targetBufferMs);
      } catch (e) {
        set({ status: "idle", error: `Recording failed: ${e}`, _tmpPath: null });
      }
    };

    if (countInSecs > 0) {
      set({ status: "count_in" });
      countInTimer = setTimeout(doStart, countInSecs * 1000);
    } else {
      await doStart();
    }
  },

  async stopRecording() {
    if (countInTimer) {
      clearTimeout(countInTimer);
      countInTimer = null;
      // Cancelled during count-in — no temp file to clean up
      set({ status: "idle", targetTrackId: null, _tmpPath: null });
      return;
    }
    const { status, targetTrackId, recordStartSecs, latencyCompensationSecs } = get();
    if (status !== "recording" && status !== "count_in") return;
    set({ status: "stopping" });
    try {
      const wavPath = await api.recordingStop();
      // Import as media asset and place on target track
      const asset = await api.mediaImportAudio(wavPath);
      const project = await api.projectGet();
      const track = project.tracks.find((t) => t.id === targetTrackId);
      if (track) {
        await api.clipPlace({
          media_asset_id: asset.id,
          track_index: track.index,
          start_secs: Math.max(0, recordStartSecs - latencyCompensationSecs),
          source_offset_secs: 0,
          duration_secs: asset.duration_secs,
        });
      }
      await useProjectStore.getState().load();
    } catch (e) {
      // Attempt to clean up temp file on error
      const tmpPath = get()._tmpPath;
      if (tmpPath) {
        try {
          const { remove } = await import("@tauri-apps/plugin-fs");
          await remove(tmpPath);
        } catch { /* best effort */ }
      }
      set({ error: `Stop recording failed: ${e}` });
    }
    set({ status: "idle", targetTrackId: null, latencyCompensationSecs: 0, _tmpPath: null });
  },

  clearError() {
    set({ error: null });
  },
} as RecordingState));
