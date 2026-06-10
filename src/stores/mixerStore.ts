import { create } from "zustand";
import * as api from "../api";
import { evaluateAutomationLane } from "../services/automationEngine";
import type { BusTrack, Project, ReturnTrack, SendRoute } from "../types";
import { v4 } from "../utils/uuid";
import { useProjectStore } from "./projectStore";

interface MixerStoreState {
  addReturnTrack: (name?: string) => Promise<void>;
  addBusTrack: (name?: string) => Promise<void>;
  assignTrackToBus: (trackId: string, busId: string | null) => Promise<void>;
  setTrackVolumeDb: (trackId: string, volumeDb: number) => Promise<void>;
  setTrackPan: (trackId: string, pan: number) => Promise<void>;
  toggleTrackMute: (trackId: string) => Promise<void>;
  addSendRoute: (fromTrackId: string, toReturnId: string) => Promise<void>;
  setSendAmount: (sendId: string, amount: number) => Promise<void>;
  toggleSendEnabled: (sendId: string) => Promise<void>;
  effectiveTrackVolumeDb: (project: Project, trackId: string, timeSecs: number) => number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function updateProject(next: Project): Promise<Project> {
  return api.projectUpdate(next);
}

function defaultReturn(index: number, name?: string): ReturnTrack {
  return {
    id: v4(),
    name: name ?? `Return ${String.fromCharCode(65 + index)}`,
    index,
    gain_db: 0,
    muted: false,
  };
}

function defaultBus(index: number, name?: string): BusTrack {
  return {
    id: v4(),
    name: name ?? `Group ${index + 1}`,
    member_track_ids: [],
    gain_db: 0,
    muted: false,
    solo: false,
  };
}

function patchProject(mutator: (project: Project) => Project): Promise<void> {
  const project = useProjectStore.getState().project;
  if (!project) return Promise.resolve();
  return updateProject(mutator(project)).then(() => useProjectStore.getState().load());
}

export const useMixerStore = create<MixerStoreState>(() => ({
  addReturnTrack(name) {
    return patchProject((project) => ({
      ...project,
      routing: {
        ...project.routing,
        returns: [...project.routing.returns, defaultReturn(project.routing.returns.length, name)],
      },
    }));
  },

  addBusTrack(name) {
    return patchProject((project) => ({
      ...project,
      routing: {
        ...project.routing,
        buses: [...project.routing.buses, defaultBus(project.routing.buses.length, name)],
      },
    }));
  },

  assignTrackToBus(trackId, busId) {
    return patchProject((project) => ({
      ...project,
      tracks: project.tracks.map((track) =>
        track.id === trackId ? { ...track, group_track_id: busId ?? undefined } : track
      ),
      routing: {
        ...project.routing,
        buses: project.routing.buses.map((bus) => ({
          ...bus,
          member_track_ids:
            bus.id === busId
              ? [...new Set([...bus.member_track_ids, trackId])]
              : bus.member_track_ids.filter((id) => id !== trackId),
        })),
      },
    }));
  },

  setTrackVolumeDb(trackId, volumeDb) {
    return patchProject((project) => ({
      ...project,
      tracks: project.tracks.map((track) =>
        track.id === trackId ? { ...track, volume_db: clamp(volumeDb, -60, 12) } : track
      ),
    }));
  },

  setTrackPan(trackId, pan) {
    return patchProject((project) => ({
      ...project,
      tracks: project.tracks.map((track) =>
        track.id === trackId ? { ...track, pan: clamp(pan, -1, 1) } : track
      ),
    }));
  },

  toggleTrackMute(trackId) {
    return patchProject((project) => ({
      ...project,
      tracks: project.tracks.map((track) =>
        track.id === trackId ? { ...track, muted: !track.muted } : track
      ),
    }));
  },

  addSendRoute(fromTrackId, toReturnId) {
    return patchProject((project) => {
      const send: SendRoute = {
        id: v4(),
        from_track_id: fromTrackId,
        to_return_id: toReturnId,
        amount: 0.25,
        pre_fader: false,
        enabled: true,
      };
      return {
        ...project,
        routing: {
          ...project.routing,
          sends: [...project.routing.sends, send],
        },
      };
    });
  },

  setSendAmount(sendId, amount) {
    return patchProject((project) => ({
      ...project,
      routing: {
        ...project.routing,
        sends: project.routing.sends.map((send) =>
          send.id === sendId ? { ...send, amount: clamp(amount, 0, 1) } : send
        ),
      },
    }));
  },

  toggleSendEnabled(sendId) {
    return patchProject((project) => ({
      ...project,
      routing: {
        ...project.routing,
        sends: project.routing.sends.map((send) =>
          send.id === sendId ? { ...send, enabled: !send.enabled } : send
        ),
      },
    }));
  },

  effectiveTrackVolumeDb(project, trackId, timeSecs) {
    const track = project.tracks.find((t) => t.id === trackId);
    if (!track) return 0;
    const lane = project.automation_lanes.find(
      (candidate) => candidate.track_id === trackId && candidate.parameter === "volume_db"
    );
    return evaluateAutomationLane(lane, timeSecs, track.volume_db);
  },
}));
