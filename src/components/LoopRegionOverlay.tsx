/**
 * LoopRegionOverlay — renders the loop region on the timeline ruler.
 * Shows a translucent colored band; left/right edge handles allow drag-resize.
 */

import { useCallback, useEffect, useRef } from "react";
import type { LoopRegion } from "../types";
import { useLoopStore } from "../stores/loopStore";

interface LoopRegionOverlayProps {
  region: LoopRegion;
  pixelsPerSec: number;
  height: number;
}

export function LoopRegionOverlay({ region, pixelsPerSec, height }: LoopRegionOverlayProps) {
  const setRegion = useLoopStore((s) => s.setRegion);
  const dragRef = useRef<{
    edge: "start" | "end";
    startX: number;
    startSecs: number;
  } | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => { cleanupRef.current?.(); };
  }, []);

  const left = region.start_secs * pixelsPerSec;
  const width = Math.max(8, (region.end_secs - region.start_secs) * pixelsPerSec);

  const onEdgeMouseDown = useCallback(
    (edge: "start" | "end") => (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      dragRef.current = {
        edge,
        startX: e.clientX,
        startSecs: edge === "start" ? region.start_secs : region.end_secs,
      };

      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = ev.clientX - dragRef.current.startX;
        const dSecs = dx / pixelsPerSec;
        const newSecs = Math.max(0, dragRef.current.startSecs + dSecs);
        if (dragRef.current.edge === "start") {
          setRegion({ ...region, start_secs: Math.min(newSecs, region.end_secs - 0.25) });
        } else {
          setRegion({ ...region, end_secs: Math.max(newSecs, region.start_secs + 0.25) });
        }
      };

      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        cleanupRef.current = null;
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      cleanupRef.current = onUp;
    },
    [region, pixelsPerSec, setRegion]
  );

  return (
    <div
      className="absolute top-0 pointer-events-none"
      style={{ left, width, height }}
    >
      {/* Loop region fill */}
      <div
        className="absolute inset-0"
        style={{
          background: region.enabled
            ? "rgba(34, 211, 238, 0.12)"
            : "rgba(34, 211, 238, 0.05)",
          borderLeft: "2px solid rgba(34, 211, 238, 0.6)",
          borderRight: "2px solid rgba(34, 211, 238, 0.6)",
        }}
      />
      {/* Left handle */}
      <div
        className="absolute top-0 bottom-0 w-2 cursor-ew-resize pointer-events-auto"
        style={{ left: -1 }}
        onMouseDown={onEdgeMouseDown("start")}
      />
      {/* Right handle */}
      <div
        className="absolute top-0 bottom-0 w-2 cursor-ew-resize pointer-events-auto"
        style={{ right: -1 }}
        onMouseDown={onEdgeMouseDown("end")}
      />
    </div>
  );
}
