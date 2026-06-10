import { useState, useEffect } from "react";
import type { TimelineClip, MediaAsset } from "../types";
import { waveformPeaks } from "../api";
import { WaveformCanvas } from "./WaveformCanvas";

interface ClipBlockProps {
  clip: TimelineClip;
  asset: MediaAsset | null;
  pixelsPerSec: number;
  trackHeight: number;
  selected?: boolean;
  onSelect?: () => void;
}

export function ClipBlock({
  clip,
  asset,
  pixelsPerSec,
  trackHeight,
  selected = false,
  onSelect,
}: ClipBlockProps) {
  const [peaks, setPeaks] = useState<{ min: number; max: number }[] | null>(null);

  const leftPx = clip.start_secs * pixelsPerSec;
  const widthPx = clip.duration_secs * pixelsPerSec;

  useEffect(() => {
    if (!asset?.path) return;
    const numBuckets = Math.max(2, Math.floor(widthPx));
    waveformPeaks(asset.path, Math.min(numBuckets, 2048))
      .then((data) => setPeaks(data.buckets))
      .catch(() => setPeaks(null));
  }, [asset?.path, widthPx]);

  return (
    <div
      className={[
        "absolute top-1 bottom-1 rounded overflow-hidden border bg-deck-panel transition-colors cursor-pointer",
        selected
          ? "border-deck-cyan shadow-glow-cyan"
          : "border-deck-border hover:border-deck-accent/50",
      ].join(" ")}
      style={{
        left: leftPx,
        width: Math.max(20, widthPx),
        height: trackHeight - 8,
      }}
      onClick={onSelect}
    >
      {peaks && peaks.length > 0 ? (
        <WaveformCanvas
          buckets={peaks}
          width={Math.max(20, widthPx)}
          height={trackHeight - 8}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-deck-text-muted text-xs">
          {asset ? asset.name : "…"}
        </div>
      )}
    </div>
  );
}
