/**
 * DrumRow — one row in the 16-step drum sequencer.
 */

import type { DrumStep } from "../../types";

interface DrumRowProps {
  label: string;
  steps: DrumStep[];
  onToggle(stepIndex: number): void;
}

export function DrumRow({ label, steps, onToggle }: DrumRowProps) {
  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <div className="w-12 shrink-0 text-right">
        <span className="text-[10px] font-mono text-deck-text-muted/70 uppercase">{label}</span>
      </div>
      <div className="flex gap-0.5">
        {steps.map((step, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onToggle(i)}
            className={[
              "w-7 h-7 rounded-sm border transition-colors",
              // Group dividers every 4 steps
              i % 4 === 0 && i > 0 ? "ml-1.5" : "",
              step.active
                ? "bg-deck-magenta border-deck-magenta shadow-[0_0_6px_rgba(232,121,249,0.4)]"
                : "bg-deck-bg border-deck-border hover:border-deck-magenta/50 hover:bg-deck-magenta/10",
            ].join(" ")}
            title={`Step ${i + 1} (${step.active ? "on" : "off"})`}
          />
        ))}
      </div>
    </div>
  );
}
