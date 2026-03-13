import { create } from "zustand";
import type { Project } from "../types";
import * as api from "../api";

interface ProjectState {
  project: Project | null;
  projectPath: string | null;
  isLoading: boolean;
  error: string | null;

  load: () => Promise<void>;
  newProject: () => Promise<void>;
  open: (path: string) => Promise<void>;
  save: (path?: string) => Promise<void>;
  setProject: (project: Project) => void;
  setProjectPath: (path: string | null) => void;
  clearError: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  projectPath: null,
  isLoading: false,
  error: null,

  async load() {
    set({ isLoading: true, error: null });
    try {
      const project = await api.projectGet();
      set({ project, isLoading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : String(e),
        isLoading: false,
      });
    }
  },

  async newProject() {
    set({ isLoading: true, error: null });
    try {
      const project = await api.projectNew();
      set({ project, projectPath: null, isLoading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : String(e),
        isLoading: false,
      });
    }
  },

  async open(path: string) {
    set({ isLoading: true, error: null });
    try {
      const project = await api.projectOpen(path);
      set({ project, projectPath: path, isLoading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : String(e),
        isLoading: false,
      });
    }
  },

  async save(path?: string) {
    const { project, projectPath } = get();
    const savePath = path ?? projectPath;
    if (!project || !savePath) {
      set({ error: "No project or path to save" });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      await api.projectSave(savePath);
      set({ projectPath: savePath, isLoading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : String(e),
        isLoading: false,
      });
    }
  },

  setProject(project) {
    set({ project });
  },

  setProjectPath(path) {
    set({ projectPath: path });
  },

  clearError() {
    set({ error: null });
  },
}));
