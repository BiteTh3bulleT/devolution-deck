/**
 * PianoRoll — full-panel MIDI clip editor.
 * Opens when midiStore.openClip is non-null.
 * Layout: toolbar → ruler → [piano keys | grid + notes]
 */

import { useCallback, useEffect, useRef } from "react";
import { useMidiStore } from "../../stores/midiStore";
import { TICKS_PER_BEAT } from "../../types";
import { PianoKeys, NOTE_HEIGHT } from "./PianoKeys";
import { PianoRollGrid } from "./PianoRollGrid";
import { PianoRollRuler } from "./PianoRollRuler";
import { NoteLayer } from "./NoteLayer";
import { QuantizeSelector } from "./QuantizeSelector";

const KEYS_WIDTH = 44;
const MIN_TOTAL_TICKS = TICKS_PER_BEAT * 4 * 8; // 8 bars default

export function PianoRoll() {
  const openClip = useMidiStore((s) => s.openClip);
  const selectedNoteIds = useMidiStore((s) => s.selectedNoteIds);
  const quantize = useMidiStore((s) => s.quantize);
  const pxPerTick = useMidiStore((s) => s.pxPerTick);
  const scrollX = useMidiStore((s) => s.scrollX);
  const scrollY = useMidiStore((s) => s.scrollY);
  const editMode = useMidiStore((s) => s.editMode);
  const {
    closePianoRoll,
    setQuantize,
    setPxPerTick,
    setScrollX,
    setScrollY,
    setEditMode,
    deleteNotes,
  } = useMidiStore();

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Initial scroll to middle C (pitch 60)
  useEffect(() => {
    if (openClip) {
      const middleC = (127 - 60) * NOTE_HEIGHT;
      setScrollY(Math.max(0, middleC - 200));
    }
  }, [openClip, setScrollY]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNoteIds.size > 0) {
          deleteNotes(Array.from(selectedNoteIds));
        }
      }
      if (e.key === "Escape") closePianoRoll();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedNoteIds, deleteNotes, closePianoRoll]);

  // Scroll sync
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      setScrollX(el.scrollLeft);
      setScrollY(el.scrollTop);
    },
    [setScrollX, setScrollY]
  );

  if (!openClip) return null;

  const clip = openClip.clip;
  const notes = clip.notes;

  const totalTicks = Math.max(
    MIN_TOTAL_TICKS,
    ...notes.map((n) => n.start_ticks + n.duration_ticks),
    TICKS_PER_BEAT * 4 * Math.ceil(clip.duration_secs / 2) || MIN_TOTAL_TICKS
  );

  const gridWidth = totalTicks * pxPerTick;
  const gridHeight = 128 * NOTE_HEIGHT;

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-deck-bg border-t border-deck-border">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-1.5 bg-deck-panel border-b border-deck-border shrink-0">
        <button
          type="button"
          onClick={closePianoRoll}
          className="px-2 py-1 rounded text-xs bg-deck-muted hover:bg-deck-graphite text-deck-text-muted"
          title="Close piano roll (Esc)"
        >
          ← Back
        </button>
        <div className="w-px h-4 bg-deck-border" />
        <span className="text-xs font-mono text-deck-text-muted">
          {notes.length} notes
        </span>
        <div className="w-px h-4 bg-deck-border" />

        {/* Edit mode buttons */}
        {(["select", "draw", "erase"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setEditMode(mode)}
            className={[
              "px-2 py-1 rounded text-xs font-mono capitalize",
              editMode === mode
                ? "bg-deck-accent text-white"
                : "bg-deck-muted hover:bg-deck-graphite text-deck-text-muted",
            ].join(" ")}
          >
            {mode === "select" ? "✦ Select" : mode === "draw" ? "✏ Draw" : "✕ Erase"}
          </button>
        ))}

        <div className="w-px h-4 bg-deck-border" />
        <QuantizeSelector value={quantize} onChange={setQuantize} />
        <div className="w-px h-4 bg-deck-border" />

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPxPerTick(pxPerTick / 1.4)}
            className="px-2 py-1 rounded text-xs bg-deck-muted hover:bg-deck-graphite text-deck-text-muted"
          >−</button>
          <span className="text-xs font-mono text-deck-text-muted w-10 text-center">
            {Math.round(pxPerTick * 480)}px/b
          </span>
          <button
            type="button"
            onClick={() => setPxPerTick(pxPerTick * 1.4)}
            className="px-2 py-1 rounded text-xs bg-deck-muted hover:bg-deck-graphite text-deck-text-muted"
          >+</button>
        </div>

        <div className="flex-1" />
        <span className="text-xs font-display text-deck-magenta opacity-60 uppercase tracking-widest">
          Piano Roll
        </span>
      </div>

      {/* Ruler row */}
      <div className="flex shrink-0">
        <div
          className="shrink-0 bg-deck-panel border-b border-r border-deck-border"
          style={{ width: KEYS_WIDTH }}
        />
        <div className="flex-1 min-w-0 overflow-hidden">
          <PianoRollRuler
            pxPerTick={pxPerTick}
            totalTicks={totalTicks}
            scrollX={scrollX}
            width={gridWidth}
          />
        </div>
      </div>

      {/* Main content: piano keys + scrollable grid */}
      <div className="flex flex-1 min-h-0">
        {/* Piano keys column */}
        <PianoKeys scrollY={scrollY} />

        {/* Grid + notes scroll area */}
        <div
          ref={scrollAreaRef}
          className="flex-1 min-w-0 overflow-auto relative"
          onScroll={handleScroll}
        >
          <div
            className="relative"
            style={{ width: gridWidth, height: gridHeight }}
          >
            <PianoRollGrid
              pxPerTick={pxPerTick}
              totalTicks={totalTicks}
              scrollX={scrollX}
              scrollY={scrollY}
              width={gridWidth}
              height={gridHeight}
              quantize={quantize}
            />
            <NoteLayer
              notes={notes}
              pxPerTick={pxPerTick}
              scrollX={scrollX}
              scrollY={scrollY}
              quantize={quantize}
              editMode={editMode}
              selectedIds={selectedNoteIds}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
