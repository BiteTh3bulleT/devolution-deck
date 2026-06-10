import { create } from "zustand";
import * as api from "../api";
import type { MidiClip, MidiNote, Project, SliceMarker, WarpState } from "../types";
import { TICKS_PER_BEAT } from "../types";
import { v4 } from "../utils/uuid";
import { useProjectStore } from "./projectStore";

function detectTransientSlices(minMax: { min: number; max: number }[], durationSecs: number): SliceMarker[] {
  if (minMax.length < 4 || durationSecs <= 0) return [];
  const energy = minMax.map((bucket) => Math.abs(bucket.max) + Math.abs(bucket.min));
  const avg = energy.reduce((acc, value) => acc + value, 0) / energy.length;
  const markers: SliceMarker[] = [];
  const stepSecs = durationSecs / energy.length;

  for (let i = 1; i < energy.length - 1; i += 1) {
    const rise = energy[i] - energy[i - 1];
    const localPeak = energy[i] > energy[i + 1];
    if (rise > avg * 0.2 && localPeak && energy[i] > avg * 0.9) {
      markers.push({
        id: v4(),
        time_secs: i * stepSecs,
        transient_strength: Math.min(1, energy[i] / (avg * 2)),
      });
    }
  }

  if (markers.length === 0) {
    const evenlySpaced = 16;
    for (let i = 1; i < evenlySpaced; i += 1) {
      markers.push({
        id: v4(),
        time_secs: (durationSecs / evenlySpaced) * i,
        transient_strength: 0.5,
      });
    }
  }
  return markers;
}

function ensureMidiTargetTrack(project: Project): { project: Project; trackId: string } {
  const existing = project.tracks.find((track) => track.track_type === "midi");
  if (existing) {
    return { project, trackId: existing.id };
  }

  const trackId = v4();
  const next = {
    ...project,
    tracks: [
      ...project.tracks,
      {
        id: trackId,
        name: "Slice MIDI",
        index: project.tracks.length,
        track_type: "midi" as const,
        clips: [],
        midi_clips: [],
        instrument: {
          id: v4(),
          name: "Slice Rack",
          plugin_type: "builtin_drums" as const,
          preset: "sliced_transients",
        },
        volume_db: 0,
        pan: 0,
        muted: false,
        solo: false,
        group_track_id: undefined,
        plugin_chain: { instances: [] },
        freeze_state: {
          is_frozen: false,
          original_clips: [],
          original_midi_clips: [],
        },
        take_lanes: [],
        comp_regions: [],
        armed: false,
      },
    ],
  };
  return { project: next, trackId };
}

function markersToNotes(
  markers: SliceMarker[],
  clipDurationSecs: number,
  bpm: number
): MidiNote[] {
  const sorted = [...markers].sort((a, b) => a.time_secs - b.time_secs);
  if (sorted.length === 0) return [];

  const clipTicks = Math.max(1, Math.round((clipDurationSecs * bpm * TICKS_PER_BEAT) / 60));
  return sorted.map((marker, index) => {
    const next = sorted[index + 1];
    const relStart = marker.time_secs / clipDurationSecs;
    const relEnd = next ? next.time_secs / clipDurationSecs : 1;
    const startTicks = Math.max(0, Math.round(relStart * clipTicks));
    const durationTicks = Math.max(30, Math.round((relEnd - relStart) * clipTicks));
    return {
      id: v4(),
      pitch: 36 + (index % 16),
      start_ticks: startTicks,
      duration_ticks: durationTicks,
      velocity: Math.max(40, Math.min(127, Math.round(40 + marker.transient_strength * 87))),
    };
  });
}

interface SampleStoreState {
  pendingMarkers: SliceMarker[];
  detectSlicesForClip: (trackId: string, clipId: string) => Promise<SliceMarker[]>;
  applySlicesToClip: (trackId: string, clipId: string, markers: SliceMarker[]) => Promise<void>;
  setClipWarp: (trackId: string, clipId: string, warp: WarpState) => Promise<void>;
  convertSlicesToMidi: (trackId: string, clipId: string) => Promise<void>;
}

export const useSampleStore = create<SampleStoreState>((set) => ({
  pendingMarkers: [],

  async detectSlicesForClip(trackId, clipId) {
    const project = useProjectStore.getState().project;
    if (!project) return [];
    const track = project.tracks.find((candidate) => candidate.id === trackId);
    const clip = track?.clips.find((candidate) => candidate.id === clipId);
    if (!track || !clip) return [];
    const asset = project.media.find((candidate) => candidate.id === clip.media_asset_id);
    if (!asset) return [];

    const peaks = await api.waveformPeaks(asset.path, Math.min(2048, Math.max(64, Math.floor(asset.duration_secs * 48))));
    const markers = detectTransientSlices(peaks.buckets, clip.duration_secs);
    set({ pendingMarkers: markers });
    return markers;
  },

  async applySlicesToClip(trackId, clipId, markers) {
    const project = useProjectStore.getState().project;
    if (!project) return;
    const updated: Project = {
      ...project,
      tracks: project.tracks.map((track) =>
        track.id !== trackId
          ? track
          : {
              ...track,
              clips: track.clips.map((clip) =>
                clip.id === clipId ? { ...clip, slice_markers: markers } : clip
              ),
            }
      ),
    };
    await api.projectUpdate(updated);
    await useProjectStore.getState().load();
    set({ pendingMarkers: [] });
  },

  async setClipWarp(trackId, clipId, warp) {
    const project = useProjectStore.getState().project;
    if (!project) return;
    const updated: Project = {
      ...project,
      tracks: project.tracks.map((track) =>
        track.id !== trackId
          ? track
          : {
              ...track,
              clips: track.clips.map((clip) => (clip.id === clipId ? { ...clip, warp } : clip)),
            }
      ),
    };
    await api.projectUpdate(updated);
    await useProjectStore.getState().load();
  },

  async convertSlicesToMidi(trackId, clipId) {
    const project = useProjectStore.getState().project;
    if (!project) return;
    const sourceTrack = project.tracks.find((candidate) => candidate.id === trackId);
    const sourceClip = sourceTrack?.clips.find((candidate) => candidate.id === clipId);
    if (!sourceTrack || !sourceClip || sourceClip.slice_markers.length === 0) return;

    const { project: seededProject, trackId: targetTrackId } = ensureMidiTargetTrack(project);
    const notes = markersToNotes(sourceClip.slice_markers, sourceClip.duration_secs, project.bpm);
    const midiClip: MidiClip = {
      id: v4(),
      start_secs: sourceClip.start_secs,
      duration_secs: sourceClip.duration_secs,
      notes,
      loop_clip: false,
    };

    const next: Project = {
      ...seededProject,
      tracks: seededProject.tracks.map((track) =>
        track.id === targetTrackId
          ? {
              ...track,
              midi_clips: [...track.midi_clips, midiClip],
            }
          : track
      ),
    };
    await api.projectUpdate(next);
    await useProjectStore.getState().load();
    set({ pendingMarkers: [] });
  },
}));
