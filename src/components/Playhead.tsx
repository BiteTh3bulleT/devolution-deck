import { useTransportStore } from "../stores/transportStore";

interface PlayheadProps {
  trackHeaderWidth: number;
  pixelsPerSec: number;
}

export function Playhead({ trackHeaderWidth, pixelsPerSec }: PlayheadProps) {
  const positionSecs = useTransportStore((s) => s.positionSecs);
  const leftPx = trackHeaderWidth + positionSecs * pixelsPerSec;

  return (
    <div
      className="pointer-events-none absolute top-0 left-0 bottom-0 z-10 w-0.5 bg-deck-cyan shadow-glow-cyan"
      style={{ left: leftPx }}
      aria-hidden
    />
  );
}
