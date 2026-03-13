interface TimelineRulerProps {
  pixelsPerSec: number;
  durationSecs: number;
}

export function TimelineRuler({ pixelsPerSec, durationSecs }: TimelineRulerProps) {
  const totalPx = durationSecs * pixelsPerSec;
  const stepSecs = pixelsPerSec > 100 ? 0.5 : pixelsPerSec > 50 ? 1 : 2;
  const ticks: number[] = [];
  for (let s = 0; s <= durationSecs; s += stepSecs) {
    ticks.push(s);
  }

  return (
    <div
      className="h-full relative bg-deck-surface border-b border-deck-border"
      style={{ width: totalPx, minWidth: "100%" }}
    >
      {ticks.map((sec) => (
        <div
          key={sec}
          className="absolute top-0 bottom-0 flex flex-col justify-end text-deck-text-muted text-[10px] font-mono"
          style={{ left: sec * pixelsPerSec }}
        >
          <span className="pb-0.5">
            {Math.floor(sec / 60)}:{(sec % 60).toString().padStart(2, "0")}
          </span>
        </div>
      ))}
    </div>
  );
}
