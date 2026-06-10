/**
 * MetronomeWidget — toggle + count-in selector for the transport bar.
 */

import { useMetronomeStore } from "../stores/metronomeStore";

export function MetronomeWidget() {
  const enabled = useMetronomeStore((s) => s.enabled);
  const countInBars = useMetronomeStore((s) => s.countInBars);
  const toggle = useMetronomeStore((s) => s.toggle);
  const setCountIn = useMetronomeStore((s) => s.setCountIn);

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        title={`Metronome: ${enabled ? "on" : "off"}`}
        className={[
          "px-2 py-1 rounded text-xs font-mono transition-colors",
          enabled
            ? "bg-deck-cyan/20 border border-deck-cyan/60 text-deck-cyan"
            : "bg-deck-muted border border-deck-border text-deck-text-muted hover:border-deck-cyan/30",
        ].join(" ")}
      >
        ♩ Click
      </button>
      <select
        value={countInBars}
        onChange={(e) => setCountIn(Number(e.target.value))}
        title="Count-in bars"
        className="bg-deck-surface border border-deck-border text-deck-text-muted text-xs font-mono rounded px-1 py-0.5 cursor-pointer focus:outline-none focus:border-deck-cyan/50 w-16"
      >
        <option value={0}>No in</option>
        <option value={1}>1 bar</option>
        <option value={2}>2 bars</option>
        <option value={4}>4 bars</option>
      </select>
    </div>
  );
}
