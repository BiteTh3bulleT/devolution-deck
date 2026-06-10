import { create } from "zustand";
import * as api from "../api";
import type { AutomationLane, AutomationPoint } from "../types";
import { v4 } from "../utils/uuid";
import { useProjectStore } from "./projectStore";

interface AutomationStoreState {
  selectedLaneId: string | null;
  selectedTrackId: string | null;
  selectedParameter: string;

  selectLane: (laneId: string | null) => void;
  setSelectedTrack: (trackId: string | null) => void;
  setSelectedParameter: (parameter: string) => void;
  ensureLane: (trackId: string, parameter: string) => Promise<AutomationLane>;
  addPoint: (laneId: string, point: Omit<AutomationPoint, "id">) => Promise<void>;
  updatePoint: (laneId: string, pointId: string, patch: Partial<AutomationPoint>) => Promise<void>;
  deletePoint: (laneId: string, pointId: string) => Promise<void>;
  toggleLaneEnabled: (laneId: string) => Promise<void>;
}

function sortPoints(points: AutomationPoint[]): AutomationPoint[] {
  return [...points].sort((a, b) => a.time_secs - b.time_secs);
}

export const useAutomationStore = create<AutomationStoreState>((set, get) => ({
  selectedLaneId: null,
  selectedTrackId: null,
  selectedParameter: "volume_db",

  selectLane(laneId) {
    set({ selectedLaneId: laneId });
  },

  setSelectedTrack(trackId) {
    set({ selectedTrackId: trackId });
  },

  setSelectedParameter(parameter) {
    set({ selectedParameter: parameter });
  },

  async ensureLane(trackId, parameter) {
    const project = useProjectStore.getState().project;
    if (!project) {
      throw new Error("No project loaded");
    }
    const existing = project.automation_lanes.find(
      (lane) => lane.track_id === trackId && lane.parameter === parameter
    );
    if (existing) {
      set({ selectedLaneId: existing.id, selectedTrackId: trackId, selectedParameter: parameter });
      return existing;
    }
    const lane: AutomationLane = {
      id: v4(),
      track_id: trackId,
      parameter,
      enabled: true,
      points: [],
    };
    const updated = {
      ...project,
      automation_lanes: [...project.automation_lanes, lane],
    };
    await api.projectUpdate(updated);
    await useProjectStore.getState().load();
    set({ selectedLaneId: lane.id, selectedTrackId: trackId, selectedParameter: parameter });
    return lane;
  },

  async addPoint(laneId, point) {
    const project = useProjectStore.getState().project;
    if (!project) return;
    const updated = {
      ...project,
      automation_lanes: project.automation_lanes.map((lane) =>
        lane.id !== laneId
          ? lane
          : {
              ...lane,
              points: sortPoints([...lane.points, { ...point, id: v4() }]),
            }
      ),
    };
    await api.projectUpdate(updated);
    await useProjectStore.getState().load();
  },

  async updatePoint(laneId, pointId, patch) {
    const project = useProjectStore.getState().project;
    if (!project) return;
    const updated = {
      ...project,
      automation_lanes: project.automation_lanes.map((lane) =>
        lane.id !== laneId
          ? lane
          : {
              ...lane,
              points: sortPoints(
                lane.points.map((point) =>
                  point.id === pointId ? { ...point, ...patch, id: point.id } : point
                )
              ),
            }
      ),
    };
    await api.projectUpdate(updated);
    await useProjectStore.getState().load();
  },

  async deletePoint(laneId, pointId) {
    const project = useProjectStore.getState().project;
    if (!project) return;
    const updated = {
      ...project,
      automation_lanes: project.automation_lanes.map((lane) =>
        lane.id !== laneId
          ? lane
          : {
              ...lane,
              points: lane.points.filter((point) => point.id !== pointId),
            }
      ),
    };
    await api.projectUpdate(updated);
    await useProjectStore.getState().load();
  },

  async toggleLaneEnabled(laneId) {
    const project = useProjectStore.getState().project;
    if (!project) return;
    const updated = {
      ...project,
      automation_lanes: project.automation_lanes.map((lane) =>
        lane.id !== laneId
          ? lane
          : {
              ...lane,
              enabled: !lane.enabled,
            }
      ),
    };
    await api.projectUpdate(updated);
    await useProjectStore.getState().load();
    if (get().selectedLaneId === laneId) {
      set({ selectedLaneId: laneId });
    }
  },
}));
