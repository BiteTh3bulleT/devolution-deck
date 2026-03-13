import type { Track as TrackType, Project } from "../types";
import { ClipBlock } from "./ClipBlock";
import { useViewStore } from "../stores/viewStore";

interface TrackLaneProps {
  track: TrackType;
  project: Project;
  pixelsPerSec: number;
  trackHeaderWidth: number;
  timelineWidthPx: number;
  rulerHeight: number;
}

export function TrackLane({
  track,
  project,
  pixelsPerSec,
  trackHeaderWidth,
  timelineWidthPx,
}: TrackLaneProps) {
  const trackHeight = useViewStore((s) => s.trackHeight);

  return (
    <div
      className="flex shrink-0 border-b border-deck-border"
      style={{ height: trackHeight }}
    >
      <div
        className="shrink-0 flex items-center px-2 bg-deck-panel border-r border-deck-border"
        style={{ width: trackHeaderWidth }}
      >
        <span className="text-sm text-deck-text-muted truncate">{track.name}</span>
      </div>
      <div
        className="relative flex-1 bg-deck-surface min-w-0"
        style={{ width: timelineWidthPx }}
      >
        {track.clips.map((clip) => {
          const asset = project.media.find((m) => m.id === clip.media_asset_id);
          return (
            <ClipBlock
              key={clip.id}
              clip={clip}
              asset={asset ?? null}
              pixelsPerSec={pixelsPerSec}
              trackHeight={trackHeight}
            />
          );
        })}
      </div>
    </div>
  );
}
