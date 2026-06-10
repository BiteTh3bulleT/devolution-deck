import { create } from "zustand";
import * as api from "../api";
import type {
  Project,
  Scene,
  SessionClip,
  SessionClipSource,
  TimelineClip,
  Track,
  WarpState,
} from "../types";
import { v4 } from "../utils/uuid";
import { useProjectStore } from "./projectStore";
import { useTransportStore } from "./transportStore";

function quantizedLaunchTime(positionSecs: number, bpm: number, quantizeBeats: number): number {
  const beatSecs = 60 / Math.max(1, bpm);
  const gridSecs = beatSecs * Math.max(1, quantizeBeats);
  const ratio = positionSecs / gridSecs;
  const snapped = Math.ceil(ratio) * gridSecs;
  return Number(snapped.toFixed(6));
}

function warpedDuration(lengthSecs: number, warp?: WarpState): number {
  if (!warp?.enabled || !warp.source_bpm || !warp.target_bpm || warp.target_bpm <= 0) {
    return lengthSecs;
  }
  return lengthSecs * (warp.source_bpm / warp.target_bpm);
}

function latestAudioClip(track: Track): TimelineClip | undefined {
  return [...track.clips].sort((a, b) => b.start_secs - a.start_secs)[0];
}

function buildDefaultScene(index: number): Scene {
  const labels = ["Intro", "Build", "Drop", "Break", "Outro", "Scene"];
  return {
    id: v4(),
    name: labels[index] ? `${labels[index]} ${index + 1}` : `Scene ${index + 1}`,
    color: ["#22d3ee", "#fbbf24", "#e879f9", "#f97316", "#34d399"][index % 5],
    index,
    launch_quantize_beats: 4,
  };
}

function ensureSession(project: Project): Project {
  if (project.session.scenes.length > 0) return project;
  return {
    ...project,
    session: {
      ...project.session,
      scenes: [buildDefaultScene(0)],
    },
  };
}

function upsertSessionClip(
  project: Project,
  trackId: string,
  sceneId: string,
  source: SessionClipSource,
  lengthSecs: number,
  name: string,
  warp?: WarpState
): Project {
  const existing = project.session.clips.find(
    (clip) => clip.track_id === trackId && clip.scene_id === sceneId
  );

  const nextClip: SessionClip = existing
    ? {
        ...existing,
        source,
        length_secs: lengthSecs,
        warp,
        name,
      }
    : {
        id: v4(),
        track_id: trackId,
        scene_id: sceneId,
        source,
        length_secs: lengthSecs,
        gain_db: 0,
        muted: false,
        warp,
        slices: [],
        name,
      };

  const clips = existing
    ? project.session.clips.map((clip) => (clip.id === existing.id ? nextClip : clip))
    : [...project.session.clips, nextClip];

  return {
    ...project,
    session: {
      ...project.session,
      clips,
    },
  };
}

interface SessionStoreState {
  selectedSceneId: string | null;
  queuedSceneId: string | null;
  queuedLaunchAtSecs: number | null;
  isLaunching: boolean;

  selectScene: (sceneId: string | null) => void;
  ensureDefaults: () => Promise<void>;
  addScene: () => Promise<void>;
  captureCellFromTrack: (trackId: string, sceneId: string) => Promise<void>;
  createAudioCellFromAsset: (trackId: string, sceneId: string, mediaAssetId: string) => Promise<void>;
  removeCell: (trackId: string, sceneId: string) => Promise<void>;
  launchScene: (sceneId: string) => Promise<void>;
}

export const useSessionStore = create<SessionStoreState>((set) => ({
  selectedSceneId: null,
  queuedSceneId: null,
  queuedLaunchAtSecs: null,
  isLaunching: false,

  selectScene(sceneId) {
    set({ selectedSceneId: sceneId });
  },

  async ensureDefaults() {
    const project = useProjectStore.getState().project;
    if (!project) return;
    const ensured = ensureSession(project);
    if (ensured === project) return;
    await api.projectUpdate(ensured);
    await useProjectStore.getState().load();
    set({ selectedSceneId: ensured.session.scenes[0]?.id ?? null });
  },

  async addScene() {
    const project = useProjectStore.getState().project;
    if (!project) return;
    const next = ensureSession(project);
    const scene = buildDefaultScene(next.session.scenes.length);
    const updated = {
      ...next,
      session: {
        ...next.session,
        scenes: [...next.session.scenes, scene],
      },
    };
    await api.projectUpdate(updated);
    await useProjectStore.getState().load();
    set({ selectedSceneId: scene.id });
  },

  async captureCellFromTrack(trackId, sceneId) {
    const project = useProjectStore.getState().project;
    if (!project) return;
    const track = project.tracks.find((t) => t.id === trackId);
    if (!track) return;
    let updated: Project;
    if (track.track_type === "audio") {
      const clip = latestAudioClip(track);
      if (!clip) return;
      updated = upsertSessionClip(
        ensureSession(project),
        trackId,
        sceneId,
        {
          kind: "audio",
          media_asset_id: clip.media_asset_id,
          source_offset_secs: clip.source_offset_secs,
        },
        clip.duration_secs,
        `${track.name} Cell`,
        clip.warp
      );
    } else {
      const midi = [...track.midi_clips].sort((a, b) => b.start_secs - a.start_secs)[0];
      if (!midi) return;
      updated = upsertSessionClip(
        ensureSession(project),
        trackId,
        sceneId,
        {
          kind: "midi",
          notes: midi.notes,
        },
        midi.duration_secs,
        `${track.name} Cell`
      );
    }
    await api.projectUpdate(updated);
    await useProjectStore.getState().load();
  },

  async createAudioCellFromAsset(trackId, sceneId, mediaAssetId) {
    const project = useProjectStore.getState().project;
    if (!project) return;
    const asset = project.media.find((m) => m.id === mediaAssetId);
    if (!asset) return;
    const updated = upsertSessionClip(
      ensureSession(project),
      trackId,
      sceneId,
      {
        kind: "audio",
        media_asset_id: mediaAssetId,
        source_offset_secs: 0,
      },
      asset.duration_secs,
      asset.name
    );
    await api.projectUpdate(updated);
    await useProjectStore.getState().load();
  },

  async removeCell(trackId, sceneId) {
    const project = useProjectStore.getState().project;
    if (!project) return;
    const updated = {
      ...project,
      session: {
        ...project.session,
        clips: project.session.clips.filter(
          (clip) => !(clip.track_id === trackId && clip.scene_id === sceneId)
        ),
      },
    };
    await api.projectUpdate(updated);
    await useProjectStore.getState().load();
  },

  async launchScene(sceneId) {
    const project = useProjectStore.getState().project;
    if (!project) return;
    const scene = project.session.scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    const transport = useTransportStore.getState();
    const launchAt = quantizedLaunchTime(
      transport.positionSecs,
      project.bpm,
      project.session.launch_quantize_beats || scene.launch_quantize_beats || 4
    );

    set({
      queuedSceneId: sceneId,
      queuedLaunchAtSecs: launchAt,
      isLaunching: true,
    });

    const launchedClips = project.session.clips.filter((clip) => clip.scene_id === sceneId);
    const trackMap = new Map(project.tracks.map((track) => [track.id, track]));
    const nextTracks = project.tracks.map((track) => ({
      ...track,
      clips: [...track.clips],
      midi_clips: [...track.midi_clips],
    }));
    const nextTrackMap = new Map(nextTracks.map((track) => [track.id, track]));

    for (const clip of launchedClips) {
      const track = trackMap.get(clip.track_id);
      const mutableTrack = nextTrackMap.get(clip.track_id);
      if (!track || !mutableTrack || clip.muted) continue;

      if (clip.source.kind === "audio") {
        mutableTrack.clips.push({
          id: v4(),
          media_asset_id: clip.source.media_asset_id,
          start_secs: launchAt,
          source_offset_secs: clip.source.source_offset_secs,
          duration_secs: warpedDuration(clip.length_secs, clip.warp),
          warp: clip.warp,
          slice_markers: clip.slices,
        });
      } else {
        mutableTrack.midi_clips.push({
          id: v4(),
          start_secs: launchAt,
          duration_secs: clip.length_secs,
          notes: clip.source.notes,
          loop_clip: false,
        });
      }
    }

    const updated: Project = {
      ...project,
      tracks: nextTracks,
      session: {
        ...project.session,
        active_scene_id: sceneId,
      },
    };

    await api.projectUpdate(updated);
    await useProjectStore.getState().load();
    set({
      selectedSceneId: sceneId,
      queuedSceneId: null,
      queuedLaunchAtSecs: null,
      isLaunching: false,
    });
  },
}));
