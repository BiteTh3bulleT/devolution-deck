import { useRef } from "react";
import { useProjectStore } from "../stores/projectStore";
import { useViewStore } from "../stores/viewStore";
import { useLoopStore } from "../stores/loopStore";
import { TimelineRuler } from "./TimelineRuler";
import { TrackLane } from "./TrackLane";
import { Playhead } from "./Playhead";
import { LoopRegionOverlay } from "./LoopRegionOverlay";

export function Timeline() {
  const project = useProjectStore((s) => s.project);
  const trackHeaderWidth = useViewStore((s) => s.trackHeaderWidth);
  const rulerHeight = useViewStore((s) => s.rulerHeight);
  const pixelsPerSec = useViewStore((s) => s.pixelsPerSec);
  const loopRegion = useLoopStore((s) => s.region);
  const scrollRef = useRef<HTMLDivElement>(null);

  const tracks = project?.tracks ?? [];
  const allClipEnds = tracks.flatMap((t) => [
    ...t.clips.map((c) => c.start_secs + c.duration_secs),
    ...t.midi_clips.map((c) => c.start_secs + c.duration_secs),
  ]);
  const durationSecs = Math.max(60, ...allClipEnds, 1);
  const timelineWidthPx = durationSecs * pixelsPerSec;
  const contentWidth = trackHeaderWidth + timelineWidthPx;

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-deck-bg">
      <div className="flex shrink-0" style={{ height: rulerHeight }}>
        <div
          className="shrink-0 bg-deck-panel border-b border-r border-deck-border"
          style={{ width: trackHeaderWidth }}
        />
        <div className="flex-1 min-w-0 overflow-hidden relative">
          <TimelineRuler pixelsPerSec={pixelsPerSec} durationSecs={durationSecs} />
          {loopRegion && (
            <LoopRegionOverlay
              region={loopRegion}
              pixelsPerSec={pixelsPerSec}
              height={rulerHeight}
            />
          )}
        </div>
      </div>
      <div className="flex flex-1 min-h-0 overflow-auto relative" ref={scrollRef}>
        <div className="flex flex-col relative min-h-full" style={{ minWidth: contentWidth }}>
          <Playhead trackHeaderWidth={trackHeaderWidth} pixelsPerSec={pixelsPerSec} />
          {tracks.length === 0 ? (
            <div
              className="flex items-center justify-center text-deck-text-muted text-sm"
              style={{ width: contentWidth, minHeight: 120 }}
            >
              Add a track — double-click a MIDI track lane to add clips
            </div>
          ) : (
            tracks.map((track) => (
              <TrackLane
                key={track.id}
                track={track}
                project={project!}
                pixelsPerSec={pixelsPerSec}
                trackHeaderWidth={trackHeaderWidth}
                timelineWidthPx={timelineWidthPx}
                rulerHeight={rulerHeight}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
