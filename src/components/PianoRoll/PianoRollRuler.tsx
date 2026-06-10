/**
 * PianoRollRuler — bar/beat ruler above the piano roll grid.
 */

import { TICKS_PER_BEAT } from "../../types";

interface PianoRollRulerProps {
  pxPerTick: number;
  totalTicks: number;
  scrollX: number;
  width: number;
}

const RULER_HEIGHT = 24;

export function PianoRollRuler({ pxPerTick, totalTicks, scrollX, width }: PianoRollRulerProps) {
  const barTicks = TICKS_PER_BEAT * 4;
  const totalBars = Math.ceil(totalTicks / barTicks) + 1;
  const bars = Array.from({ length: totalBars }, (_, i) => i);

  return (
    <div
      className="relative bg-deck-panel border-b border-deck-border shrink-0 overflow-hidden"
      style={{ height: RULER_HEIGHT, width }}
    >
      <div
        className="absolute top-0 bottom-0"
        style={{ transform: `translateX(-${scrollX}px)`, width: totalTicks * pxPerTick }}
      >
        {bars.map((bar) => {
          const x = bar * barTicks * pxPerTick;
          return (
            <div
              key={bar}
              className="absolute top-0 bottom-0 flex items-center"
              style={{ left: x }}
            >
              <div className="w-px h-full bg-deck-border/60" />
              <span className="text-[9px] font-mono text-deck-text-muted/60 ml-1 select-none">
                {bar + 1}
              </span>
              {/* Beat sub-ticks */}
              {[1, 2, 3].map((beat) => {
                const bx = beat * TICKS_PER_BEAT * pxPerTick;
                return (
                  <div
                    key={beat}
                    className="absolute top-1/2 w-px bg-deck-border/30"
                    style={{ left: bx, height: "40%" }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { RULER_HEIGHT as PIANO_ROLL_RULER_HEIGHT };
