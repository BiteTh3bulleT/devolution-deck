import { create } from "zustand";
import * as api from "../api";
import type { BrowserAssetIndexEntry, BrowserTag, MediaAsset, Project } from "../types";
import { v4 } from "../utils/uuid";
import { useProjectStore } from "./projectStore";

interface BrowserStoreState {
  query: string;
  selectedTagIds: string[];
  hydrateFromProject: (project: Project | null) => void;
  setQuery: (query: string) => Promise<void>;
  toggleTagFilter: (tagId: string) => Promise<void>;
  addTag: (label: string, color?: string) => Promise<void>;
  toggleAssetTag: (assetId: string, tagId: string) => Promise<void>;
  toggleFavorite: (assetId: string) => Promise<void>;
  filteredAssets: (project: Project) => MediaAsset[];
}

function patchProject(mutator: (project: Project) => Project): Promise<void> {
  const project = useProjectStore.getState().project;
  if (!project) return Promise.resolve();
  const next = mutator(project);
  return api.projectUpdate(next).then(() => useProjectStore.getState().load());
}

function ensureAssetEntry(entries: BrowserAssetIndexEntry[], assetId: string): BrowserAssetIndexEntry[] {
  if (entries.some((entry) => entry.asset_id === assetId)) return entries;
  return [
    ...entries,
    {
      asset_id: assetId,
      tag_ids: [],
      favorite: false,
    },
  ];
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export const useBrowserStore = create<BrowserStoreState>((set, get) => ({
  query: "",
  selectedTagIds: [],

  hydrateFromProject(project) {
    if (!project) {
      set({ query: "", selectedTagIds: [] });
      return;
    }
    set({
      query: project.browser_index.search_query,
      selectedTagIds: project.browser_index.selected_tag_ids,
    });
  },

  setQuery(query) {
    set({ query });
    return patchProject((project) => ({
      ...project,
      browser_index: {
        ...project.browser_index,
        search_query: query,
      },
    }));
  },

  toggleTagFilter(tagId) {
    const selected = get().selectedTagIds;
    const next = selected.includes(tagId)
      ? selected.filter((id) => id !== tagId)
      : [...selected, tagId];
    set({ selectedTagIds: next });
    return patchProject((project) => ({
      ...project,
      browser_index: {
        ...project.browser_index,
        selected_tag_ids: next,
      },
    }));
  },

  addTag(label, color) {
    const clean = label.trim();
    if (!clean) return Promise.resolve();
    const tag: BrowserTag = {
      id: v4(),
      label: clean,
      color,
    };
    return patchProject((project) => ({
      ...project,
      browser_index: {
        ...project.browser_index,
        tags: [...project.browser_index.tags, tag],
      },
    }));
  },

  toggleAssetTag(assetId, tagId) {
    return patchProject((project) => {
      const assets = ensureAssetEntry(project.browser_index.assets, assetId).map((entry) => {
        if (entry.asset_id !== assetId) return entry;
        const hasTag = entry.tag_ids.includes(tagId);
        return {
          ...entry,
          tag_ids: hasTag
            ? entry.tag_ids.filter((id) => id !== tagId)
            : [...entry.tag_ids, tagId],
        };
      });
      return {
        ...project,
        browser_index: {
          ...project.browser_index,
          assets,
        },
      };
    });
  },

  toggleFavorite(assetId) {
    return patchProject((project) => {
      const assets = ensureAssetEntry(project.browser_index.assets, assetId).map((entry) =>
        entry.asset_id === assetId
          ? {
              ...entry,
              favorite: !entry.favorite,
            }
          : entry
      );
      return {
        ...project,
        browser_index: {
          ...project.browser_index,
          assets,
        },
      };
    });
  },

  filteredAssets(project) {
    const query = normalizeQuery(get().query || project.browser_index.search_query);
    const selectedTagIds =
      get().selectedTagIds.length > 0 ? get().selectedTagIds : project.browser_index.selected_tag_ids;

    const entryByAsset = new Map(project.browser_index.assets.map((entry) => [entry.asset_id, entry]));

    return project.media.filter((asset) => {
      if (query && !asset.name.toLowerCase().includes(query)) return false;
      if (selectedTagIds.length === 0) return true;
      const entry = entryByAsset.get(asset.id);
      if (!entry) return false;
      return selectedTagIds.every((tagId) => entry.tag_ids.includes(tagId));
    });
  },
}));
