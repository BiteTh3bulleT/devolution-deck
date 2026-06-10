import type { QuantizeDivision } from "../../types";
import { QUANTIZE_DIVISIONS } from "../../types";

interface QuantizeSelectorProps {
  value: QuantizeDivision;
  onChange(v: QuantizeDivision): void;
}

export function QuantizeSelector({ value, onChange }: QuantizeSelectorProps) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-deck-text-muted font-mono shrink-0">Q:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as QuantizeDivision)}
        className="bg-deck-surface border border-deck-border text-deck-text text-xs font-mono rounded px-1.5 py-0.5 cursor-pointer focus:outline-none focus:border-deck-accent"
      >
        {QUANTIZE_DIVISIONS.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
    </div>
  );
}
