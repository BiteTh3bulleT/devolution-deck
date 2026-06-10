import { useMemo, useState } from "react";
import { useProjectStore } from "../stores/projectStore";
import { useArrangementStore } from "../stores/arrangementStore";
import { useSampleStore } from "../stores/sampleStore";
import type { WarpState } from "../types";

function buildWarp(clipWarp: WarpState | undefined, projectBpm: number): WarpState {
  return (
    clipWarp ?? {
      enabled: true,
      source_bpm: projectBpm,
      target_bpm: projectBpm,
      algorithm: "elastique_pro",
      preserve_formants: true,
    }
  );
}

function parsePositiveBpm(value: string, fallback: number): number | null {
  if (!value.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function WarpSlicingPanel() {
  const project = useProjectStore((s) => s.project);
  const selectedAudioClip = useArrangementStore((s) => s.selectedAudioClip);
  const pendingMarkers = useSampleStore((s) => s.pendingMarkers);
  const detectSlicesForClip = useSampleStore((s) => s.detectSlicesForClip);
  const applySlicesToClip = useSampleStore((s) => s.applySlicesToClip);
  const setClipWarp = useSampleStore((s) => s.setClipWarp);
  const convertSlicesToMidi = useSampleStore((s) => s.convertSlicesToMidi);
  const [draftSourceBpm, setDraftSourceBpm] = useState<string>("");
  const [draftTargetBpm, setDraftTargetBpm] = useState<string>("");

  const context = useMemo(() => {
    if (!project || !selectedAudioClip) return null;
    const track = project.tracks.find((candidate) => candidate.id === selectedAudioClip.trackId);
    const clip = track?.clips.find((candidate) => candidate.id === selectedAudioClip.clipId);
    if (!track || !clip) return null;
    const asset = project.media.find((candidate) => candidate.id === clip.media_asset_id);
    return { track, clip, asset };
  }, [project, selectedAudioClip]);

  if (!project) {
    return <p className="text-xs text-deck-text-muted">No project loaded.</p>;
  }

  if (!context) {
    return (
      <p className="text-xs text-deck-text-muted">
        Select an audio clip in arrangement to edit warp and slicing.
      </p>
    );
  }

  const { track, clip, asset } = context;
  const warp = buildWarp(clip.warp, project.bpm);
  const sourceBpm = parsePositiveBpm(draftSourceBpm, warp.source_bpm ?? project.bpm);
  const targetBpm = parsePositiveBpm(draftTargetBpm, warp.target_bpm ?? project.bpm);
  const canApplyWarpTempo = sourceBpm !== null && targetBpm !== null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs uppercase tracking-widest text-deck-cyan">Warp / Slice</h3>
      <p className="text-[11px] text-deck-text-muted">
        {track.name} · {asset?.name ?? "Unknown asset"} · {clip.duration_secs.toFixed(2)}s
      </p>

      <label className="flex items-center justify-between text-[11px]">
        <span>Warp Enabled</span>
        <input
          type="checkbox"
          checked={warp.enabled}
          onChange={(event) =>
            void setClipWarp(track.id, clip.id, { ...warp, enabled: event.target.checked })
          }
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-deck-text-muted">
          Source BPM
          <input
            type="number"
            min={1}
            step={0.1}
            value={draftSourceBpm}
            onChange={(event) => setDraftSourceBpm(event.target.value)}
            placeholder={String(warp.source_bpm ?? project.bpm)}
            className="mt-1 w-full bg-deck-panel border border-deck-border rounded px-2 py-1 text-xs"
          />
        </label>
        <label className="text-[11px] text-deck-text-muted">
          Target BPM
          <input
            type="number"
            min={1}
            step={0.1}
            value={draftTargetBpm}
            onChange={(event) => setDraftTargetBpm(event.target.value)}
            placeholder={String(warp.target_bpm ?? project.bpm)}
            className="mt-1 w-full bg-deck-panel border border-deck-border rounded px-2 py-1 text-xs"
          />
        </label>
      </div>

      <button
        type="button"
        disabled={!canApplyWarpTempo}
        onClick={() => {
          if (!canApplyWarpTempo) return;
          void setClipWarp(track.id, clip.id, {
            ...warp,
            enabled: true,
            source_bpm: sourceBpm,
            target_bpm: targetBpm,
          });
        }}
        className="w-full rounded border border-deck-cyan/30 bg-deck-cyan/10 text-deck-cyan text-xs px-2 py-1 disabled:opacity-50"
      >
        Apply Warp Tempo
      </button>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void detectSlicesForClip(track.id, clip.id)}
          className="flex-1 rounded border border-deck-border bg-deck-muted hover:bg-deck-graphite text-xs px-2 py-1"
        >
          Detect Slices
        </button>
        <button
          type="button"
          onClick={() => void applySlicesToClip(track.id, clip.id, pendingMarkers)}
          disabled={pendingMarkers.length === 0}
          className="flex-1 rounded border border-deck-magenta/30 bg-deck-magenta/10 text-deck-magenta text-xs px-2 py-1 disabled:opacity-50"
        >
          Apply Pending
        </button>
      </div>

      <button
        type="button"
        onClick={() => void convertSlicesToMidi(track.id, clip.id)}
        disabled={clip.slice_markers.length === 0}
        className="w-full rounded border border-deck-amber/30 bg-deck-amber/10 text-deck-amber text-xs px-2 py-1 disabled:opacity-50"
      >
        Convert Applied Slices To MIDI
      </button>

      <p className="text-[10px] text-deck-text-muted">
        Pending markers: {pendingMarkers.length} · Applied markers: {clip.slice_markers.length}
      </p>
    </div>
  );
}
