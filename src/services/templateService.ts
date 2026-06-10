import { EDM_TEMPLATES } from "../data/templates";
import type {
  BrowserAssetIndexEntry,
  Project,
  ReturnTrack,
  Scene,
  SessionState,
  TemplateDefinition,
  Track,
} from "../types";
import { v4 } from "../utils/uuid";

function buildDefaultScenes(): Scene[] {
  const names = ["Intro", "Build", "Drop", "Break", "Outro"];
  const colors = ["#22d3ee", "#fbbf24", "#e879f9", "#f97316", "#34d399"];
  return names.map((name, index) => ({
    id: v4(),
    name,
    color: colors[index % colors.length],
    index,
    launch_quantize_beats: 4,
  }));
}

function buildTemplateTracks(template: TemplateDefinition): Track[] {
  return template.tracks.map((t, index) => ({
    id: v4(),
    name: t.name,
    index,
    track_type: t.track_type,
    clips: [],
    midi_clips: [],
    instrument:
      t.track_type === "midi"
        ? {
            id: v4(),
            name: t.role === "bass" ? "Mono Bass" : "Init Synth",
            plugin_type: "builtin_synth",
            preset: t.role,
          }
        : undefined,
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
  }));
}

function buildDefaultReturns(): ReturnTrack[] {
  return [
    { id: v4(), name: "Verb", index: 0, gain_db: -4, muted: false },
    { id: v4(), name: "Delay", index: 1, gain_db: -6, muted: false },
  ];
}

function seedBrowserAssets(project: Project): BrowserAssetIndexEntry[] {
  return project.media.map((asset) => ({
    asset_id: asset.id,
    tag_ids: [],
    favorite: false,
    last_used_unix_ms: undefined,
  }));
}

export function applyTemplateToProject(
  project: Project,
  template: TemplateDefinition
): Project {
  const session: SessionState = {
    scenes: buildDefaultScenes(),
    clips: [],
    launch_quantize_beats: 4,
    active_scene_id: undefined,
  };

  return {
    ...project,
    bpm: template.bpm,
    tracks: buildTemplateTracks(template),
    loop_region: undefined,
    session,
    automation_lanes: [],
    routing: {
      returns: buildDefaultReturns(),
      buses: [],
      sends: [],
    },
    templates: EDM_TEMPLATES,
    active_template_id: template.id,
    plugin_registry: project.plugin_registry,
    sidechain_routes: [],
    render_jobs: [],
    recovery_snapshots: project.recovery_snapshots,
    shortcuts: project.shortcuts,
    monitoring: project.monitoring,
    autosave_interval_secs: project.autosave_interval_secs,
    asset_classifications: [],
    browser_index: {
      ...project.browser_index,
      assets: seedBrowserAssets(project),
      selected_tag_ids: [],
      search_query: "",
    },
  };
}
