import { useCallback } from "react";
import type { Track as TrackType, Project } from "../types";
import { ClipBlock } from "./ClipBlock";
import { MidiClipBlock } from "./MidiClipBlock";
import { useViewStore } from "../stores/viewStore";
import * as api from "../api";
import { useProjectStore } from "../stores/projectStore";
import { useArrangementStore } from "../stores/arrangementStore";

interface TrackLaneProps {
  track: TrackType;
  project: Project;
  pixelsPerSec: number;
  trackHeaderWidth: number;
  timelineWidthPx: number;
  rulerHeight: number;
}

const TRACK_TYPE_LABEL: Record<string, string> = {
  audio: "AUD",
  midi: "MIDI",
};

const TRACK_TYPE_COLOR: Record<string, string> = {
  audio: "text-deck-cyan",
  midi: "text-deck-magenta",
};

export function TrackLane({
  track,
  project,
  pixelsPerSec,
  trackHeaderWidth,
  timelineWidthPx,
}: TrackLaneProps) {
  const trackHeight = useViewStore((s) => s.trackHeight);
  const load = useProjectStore((s) => s.load);
  const isMidi = track.track_type === "midi";
  const selectedAudioClip = useArrangementStore((s) => s.selectedAudioClip);
  const selectAudioClip = useArrangementStore((s) => s.selectAudioClip);

  const handleContentDoubleClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isMidi) return;
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const startSecs = Math.max(0, clickX / pixelsPerSec);
      const bpm = project.bpm ?? 120;
      const barSecs = (4 * 60) / bpm;
      try {
        await api.midiClipAdd({
          track_id: track.id,
          start_secs: startSecs,
          duration_secs: barSecs * 2,
        });
        await load();
      } catch (err) {
        console.error("midiClipAdd failed", err);
      }
    },
    [isMidi, pixelsPerSec, project.bpm, track.id, load]
  );

  return (
    <div
      className="flex shrink-0 border-b border-deck-border"
      style={{ height: trackHeight }}
    >
      <div
        className="shrink-0 flex items-center gap-1.5 px-2 bg-deck-panel border-r border-deck-border"
        style={{ width: trackHeaderWidth }}
      >
        <span
          className={`text-[9px] font-display font-bold uppercase tracking-widest shrink-0 ${TRACK_TYPE_COLOR[track.track_type] ?? "text-deck-text-muted"}`}
        >
          {TRACK_TYPE_LABEL[track.track_type] ?? "AUD"}
        </span>
        <span className="text-sm text-deck-text-muted truncate">{track.name}</span>
      </div>

      <div
        className="relative flex-1 bg-deck-surface min-w-0"
        style={{ width: timelineWidthPx }}
        onDoubleClick={handleContentDoubleClick}
      >
        {isMidi
          ? track.midi_clips.map((clip) => (
              <MidiClipBlock
                key={clip.id}
                clip={clip}
                trackId={track.id}
                pixelsPerSec={pixelsPerSec}
                trackHeight={trackHeight}
              />
            ))
          : track.clips.map((clip) => {
              const asset = project.media.find((m) => m.id === clip.media_asset_id);
              return (
                <ClipBlock
                  key={clip.id}
                  clip={clip}
                  asset={asset ?? null}
                  pixelsPerSec={pixelsPerSec}
                  trackHeight={trackHeight}
                  selected={
                    selectedAudioClip?.trackId === track.id &&
                    selectedAudioClip?.clipId === clip.id
                  }
                  onSelect={() => selectAudioClip(track.id, clip.id)}
                />
              );
            })}
        {isMidi && track.midi_clips.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs text-deck-text-muted/30 font-mono">dbl-click to add clip</span>
          </div>
        )}
      </div>
    </div>
  );
}
