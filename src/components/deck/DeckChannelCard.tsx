import { useMemo, useState } from "react";
import type { DeckState, LibraryItem } from "../../types";

interface DeckChannelCardProps {
  deck: DeckState;
  loadedItem?: LibraryItem;
  onTogglePlay: (deckId: string, playing: boolean) => Promise<void>;
  onSeek: (deckId: string, positionSecs: number) => Promise<void>;
  onNudge: (deckId: string, deltaBeats: number) => Promise<void>;
  onScratch: (deckId: string, deltaSecs: number, friction?: number) => Promise<void>;
  onConfigureTurntable: (deckId: string, vinylMode: boolean, jogSensitivity: number) => Promise<void>;
  onSetLoop: (deckId: string, startSecs: number, endSecs: number, quantizeBeats: number) => Promise<void>;
  onClearLoop: (deckId: string) => Promise<void>;
  onAddHotCue: (deckId: string, positionSecs: number) => Promise<void>;
  onTriggerCue: (deckId: string, cueId: string) => Promise<void>;
  onRemoveCue: (deckId: string, cueId: string) => Promise<void>;
}

function fmt(value: number | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "-";
  return value.toFixed(digits);
}

function progressPct(deck: DeckState, loadedItem?: LibraryItem): number {
  if (!loadedItem || loadedItem.bpm == null) return 0;
  const estimatedDuration = loadedItem.phrase_markers.length > 0
    ? Math.max(1, loadedItem.phrase_markers.length * 8 * (60 / loadedItem.bpm) * 4)
    : 1;
  return Math.min(100, (deck.position_secs / estimatedDuration) * 100);
}

export function DeckChannelCard({
  deck,
  loadedItem,
  onTogglePlay,
  onSeek,
  onNudge,
  onScratch,
  onConfigureTurntable,
  onSetLoop,
  onClearLoop,
  onAddHotCue,
  onTriggerCue,
  onRemoveCue,
}: DeckChannelCardProps) {
  const [loopStart, setLoopStart] = useState(deck.loop_state?.start_secs ?? 0);
  const [loopEnd, setLoopEnd] = useState(deck.loop_state?.end_secs ?? Math.max(1, deck.position_secs + 8));
  const [scratchSecs, setScratchSecs] = useState(0.05);
  const [busy, setBusy] = useState(false);

  const keyLabel = useMemo(() => {
    const key = loadedItem?.key_analysis;
    if (!key) return "--";
    return key.camelot ? `${key.key} ${key.scale} (${key.camelot})` : `${key.key} ${key.scale}`;
  }, [loadedItem?.key_analysis]);

  return (
    <section className="rounded border border-deck-border bg-deck-panel/90 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-deck-cyan">Deck {deck.id}</p>
          <h3 className="text-sm text-deck-text truncate">{loadedItem?.title ?? "No track loaded"}</h3>
          <p className="text-[11px] text-deck-text-muted truncate">{loadedItem?.artist ?? "Load from library"}</p>
        </div>
        <button
          type="button"
          onClick={() => void onTogglePlay(deck.id, !deck.playing)}
          disabled={!deck.loaded_track || busy}
          className={[
            "px-3 py-1 rounded border text-xs disabled:opacity-50",
            deck.playing
              ? "bg-deck-accent/20 border-deck-accent/40 text-deck-accent"
              : "bg-deck-cyan/15 border-deck-cyan/40 text-deck-cyan",
          ].join(" ")}
        >
          {deck.playing ? "Stop" : "Play"}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2 text-[11px]">
        <div className="rounded border border-deck-border bg-deck-surface p-2">
          <div className="text-deck-text-muted">BPM</div>
          <div className="text-deck-amber tabular-nums">{fmt(deck.tempo_bpm)}</div>
        </div>
        <div className="rounded border border-deck-border bg-deck-surface p-2">
          <div className="text-deck-text-muted">Pitch</div>
          <div className="tabular-nums">{(deck.tempo_multiplier * 100).toFixed(1)}%</div>
        </div>
        <div className="rounded border border-deck-border bg-deck-surface p-2">
          <div className="text-deck-text-muted">Key</div>
          <div className="truncate">{keyLabel}</div>
        </div>
        <div className="rounded border border-deck-border bg-deck-surface p-2">
          <div className="text-deck-text-muted">Phase</div>
          <div className="tabular-nums">{fmt(deck.beat_phase, 2)}</div>
        </div>
      </div>

      <div className="space-y-1">
        <div className="h-1.5 rounded bg-deck-surface border border-deck-border overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-deck-cyan to-deck-magenta"
            style={{ width: `${progressPct(deck, loadedItem)}%` }}
          />
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <input
            type="number"
            min={0}
            step={0.05}
            value={deck.position_secs.toFixed(2)}
            onChange={(event) => void onSeek(deck.id, Number(event.target.value))}
            className="w-24 rounded border border-deck-border bg-deck-surface px-2 py-1 tabular-nums"
          />
          <button
            type="button"
            onClick={async () => {
              setBusy(true);
              try {
                await onAddHotCue(deck.id, deck.position_secs);
              } finally {
                setBusy(false);
              }
            }}
            className="px-2 py-1 rounded border border-deck-cyan/40 text-deck-cyan"
          >
            + Hot Cue
          </button>
          <span className="text-deck-text-muted">Quantize {deck.quantize_beats} beats</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-wide text-deck-text-muted">Turntable</p>
        <div className="grid grid-cols-[auto_auto_1fr] gap-1.5 items-center text-[11px]">
          <button
            type="button"
            onClick={() => void onNudge(deck.id, -0.25)}
            disabled={busy}
            className="px-2 py-1 rounded border border-deck-border text-deck-text-muted disabled:opacity-50"
          >
            Nudge -1/4
          </button>
          <button
            type="button"
            onClick={() => void onNudge(deck.id, 0.25)}
            disabled={busy}
            className="px-2 py-1 rounded border border-deck-border text-deck-text-muted disabled:opacity-50"
          >
            Nudge +1/4
          </button>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={deck.vinyl_mode}
              onChange={(event) =>
                void onConfigureTurntable(deck.id, event.target.checked, deck.jog_sensitivity)
              }
            />
            Vinyl Mode
          </label>
        </div>
        <div className="grid grid-cols-[1fr_auto_auto] gap-1.5 items-center text-[11px]">
          <label className="flex items-center gap-2 text-deck-text-muted">
            Jog
            <input
              type="range"
              min={0.1}
              max={3}
              step={0.05}
              value={deck.jog_sensitivity}
              onChange={(event) =>
                void onConfigureTurntable(deck.id, deck.vinyl_mode, Number(event.target.value))
              }
            />
            <span className="tabular-nums">{deck.jog_sensitivity.toFixed(2)}</span>
          </label>
          <input
            type="number"
            min={-0.5}
            max={0.5}
            step={0.01}
            value={scratchSecs}
            onChange={(event) => setScratchSecs(Number(event.target.value))}
            className="w-20 rounded border border-deck-border bg-deck-surface px-2 py-1"
          />
          <button
            type="button"
            onClick={() => void onScratch(deck.id, scratchSecs, 0.8)}
            disabled={!deck.vinyl_mode || busy}
            className="px-2 py-1 rounded border border-deck-magenta/40 text-deck-magenta disabled:opacity-50"
          >
            Scratch
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-wide text-deck-text-muted">Hot Cues</p>
        <div className="grid grid-cols-4 gap-1.5">
          {deck.hot_cues.map((cue) => (
            <div key={cue.id} className="rounded border border-deck-border bg-deck-surface p-1">
              <button
                type="button"
                onClick={() => void onTriggerCue(deck.id, cue.id)}
                className="w-full text-left text-[10px] text-deck-text truncate"
              >
                {cue.label} · {fmt(cue.position_secs, 2)}
              </button>
              <button
                type="button"
                onClick={() => void onRemoveCue(deck.id, cue.id)}
                className="mt-1 text-[10px] text-red-300"
              >
                Remove
              </button>
            </div>
          ))}
          {deck.hot_cues.length === 0 && (
            <p className="col-span-full text-[10px] text-deck-text-muted">No cues saved.</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-wide text-deck-text-muted">Loop</p>
        <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-1.5 items-center text-[11px]">
          <input
            type="number"
            min={0}
            step={0.05}
            value={loopStart}
            onChange={(event) => setLoopStart(Number(event.target.value))}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1"
          />
          <input
            type="number"
            min={0}
            step={0.05}
            value={loopEnd}
            onChange={(event) => setLoopEnd(Number(event.target.value))}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1"
          />
          <button
            type="button"
            onClick={() => void onSetLoop(deck.id, loopStart, loopEnd, deck.quantize_beats)}
            className="px-2 py-1 rounded border border-deck-magenta/40 text-deck-magenta"
          >
            Set
          </button>
          <button
            type="button"
            onClick={() => void onClearLoop(deck.id)}
            className="px-2 py-1 rounded border border-deck-border text-deck-text-muted"
          >
            Clear
          </button>
        </div>
        {deck.loop_state && (
          <p className="text-[10px] text-deck-cyan">
            Active: {fmt(deck.loop_state.start_secs, 2)}s → {fmt(deck.loop_state.end_secs, 2)}s
          </p>
        )}
      </div>
    </section>
  );
}
