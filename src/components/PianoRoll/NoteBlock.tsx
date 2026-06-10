/**
 * NoteBlock — a single MIDI note rendered as a DOM div.
 * Supports: click-select, drag-move, right-edge resize, right-click-delete.
 */

import { useCallback, useEffect, useRef } from "react";
import type { MidiNote, QuantizeDivision } from "../../types";
import { snapTicks } from "../../types";
import { NOTE_HEIGHT } from "./PianoKeys";

interface NoteBlockProps {
  note: MidiNote;
  pxPerTick: number;
  isSelected: boolean;
  quantize: QuantizeDivision;
  onSelect(id: string, multi: boolean): void;
  onDelete(id: string): void;
  onMove(id: string, newStartTicks: number, newPitch: number): void;
  onResize(id: string, newDurationTicks: number): void;
}

const MIN_DURATION_TICKS = 30;

export function NoteBlock({
  note,
  pxPerTick,
  isSelected,
  quantize,
  onSelect,
  onDelete,
  onMove,
  onResize,
}: NoteBlockProps) {
  const x = note.start_ticks * pxPerTick;
  const y = (127 - note.pitch) * NOTE_HEIGHT;
  const w = Math.max(6, note.duration_ticks * pxPerTick);
  const h = NOTE_HEIGHT - 1;

  const dragState = useRef<{
    type: "move" | "resize";
    startClientX: number;
    startClientY: number;
    startTicks: number;
    startPitch: number;
    startDuration: number;
  } | null>(null);

  // Store cleanup function for window listeners to call on unmount
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      // Remove any active window listeners if component unmounts mid-drag
      cleanupRef.current?.();
    };
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, type: "move" | "resize") => {
      e.stopPropagation();
      if (e.button === 2) return; // handled by onContextMenu
      onSelect(note.id, e.shiftKey || e.ctrlKey || e.metaKey);
      dragState.current = {
        type,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startTicks: note.start_ticks,
        startPitch: note.pitch,
        startDuration: note.duration_ticks,
      };

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragState.current) return;
        const dx = ev.clientX - dragState.current.startClientX;
        const dy = ev.clientY - dragState.current.startClientY;
        const dTicks = dx / pxPerTick;

        if (dragState.current.type === "resize") {
          const newDur = Math.max(
            MIN_DURATION_TICKS,
            snapTicks(dragState.current.startDuration + dTicks, quantize)
          );
          onResize(note.id, newDur);
        } else {
          const newStart = Math.max(
            0,
            snapTicks(dragState.current.startTicks + dTicks, quantize)
          );
          // Each NOTE_HEIGHT px of vertical drag = 1 semitone (inverted: drag down = lower pitch)
          const pitchDelta = -Math.round(dy / NOTE_HEIGHT);
          const newPitch = Math.max(
            0,
            Math.min(127, dragState.current.startPitch + pitchDelta)
          );
          onMove(note.id, newStart, newPitch);
        }
      };

      const onMouseUp = () => {
        dragState.current = null;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        cleanupRef.current = null;
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      cleanupRef.current = onMouseUp;
    },
    [note, pxPerTick, quantize, onSelect, onMove, onResize]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onDelete(note.id);
    },
    [note.id, onDelete]
  );

  return (
    <div
      className={[
        "absolute rounded-sm select-none cursor-grab active:cursor-grabbing",
        isSelected
          ? "bg-deck-cyan/80 border border-deck-cyan"
          : "bg-deck-magenta/70 border border-deck-magenta/50 hover:border-deck-magenta",
      ].join(" ")}
      style={{ left: x, top: y, width: w, height: h }}
      onMouseDown={(e) => handleMouseDown(e, "move")}
      onContextMenu={handleContextMenu}
    >
      {/* Resize handle */}
      <div
        className="absolute top-0 right-0 bottom-0 w-2 cursor-ew-resize"
        onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, "resize"); }}
      />
    </div>
  );
}
