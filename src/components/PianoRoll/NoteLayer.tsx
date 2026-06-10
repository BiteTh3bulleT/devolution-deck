/**
 * NoteLayer — hosts all NoteBlocks, handles create/select/drag/erase.
 * Sits on top of the grid canvas inside the piano roll scroll area.
 */

import { useCallback } from "react";
import type { MidiNote, QuantizeDivision } from "../../types";
import { snapTicks, TICKS_PER_BEAT, DIVISION_TICKS } from "../../types";
import { NOTE_HEIGHT } from "./PianoKeys";
import { NoteBlock } from "./NoteBlock";
import { v4 as uuidv4 } from "../../utils/uuid";
import { useMidiStore } from "../../stores/midiStore";

interface NoteLayerProps {
  notes: MidiNote[];
  pxPerTick: number;
  scrollX: number;
  scrollY: number;
  quantize: QuantizeDivision;
  editMode: "select" | "draw" | "erase";
  selectedIds: Set<string>;
}

export function NoteLayer({
  notes,
  pxPerTick,
  scrollX,
  scrollY,
  quantize,
  editMode,
  selectedIds,
}: NoteLayerProps) {
  const { addNote, updateNote, deleteNotes, setSelectedNotes, clearSelection } = useMidiStore();

  const handleLayerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (editMode !== "draw") {
        clearSelection();
        return;
      }
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      const x = e.clientX - rect.left + scrollX;
      const y = e.clientY - rect.top + scrollY;
      const pitch = Math.max(0, Math.min(127, 127 - Math.floor(y / NOTE_HEIGHT)));
      const rawTicks = x / pxPerTick;
      const startTicks = snapTicks(rawTicks, quantize);
      const defaultDur = DIVISION_TICKS[quantize] * 2;
      const note: MidiNote = {
        id: uuidv4(),
        pitch,
        start_ticks: startTicks,
        duration_ticks: defaultDur,
        velocity: 100,
      };
      addNote(note);
    },
    [editMode, scrollX, scrollY, pxPerTick, quantize, addNote, clearSelection]
  );

  const handleSelect = useCallback(
    (id: string, multi: boolean) => {
      if (editMode === "erase") {
        deleteNotes([id]);
        return;
      }
      if (multi) {
        const s = new Set(selectedIds);
        if (s.has(id)) s.delete(id);
        else s.add(id);
        setSelectedNotes(Array.from(s));
      } else {
        setSelectedNotes([id]);
      }
    },
    [editMode, selectedIds, setSelectedNotes, deleteNotes]
  );

  const handleDelete = useCallback(
    (id: string) => deleteNotes([id]),
    [deleteNotes]
  );

  const handleMove = useCallback(
    (id: string, newStartTicks: number, newPitch: number) => {
      updateNote(id, { start_ticks: newStartTicks, pitch: newPitch });
    },
    [updateNote]
  );

  const handleResize = useCallback(
    (id: string, newDurationTicks: number) => {
      updateNote(id, { duration_ticks: newDurationTicks });
    },
    [updateNote]
  );

  const totalTicks = Math.max(TICKS_PER_BEAT * 4 * 16, ...notes.map((n) => n.start_ticks + n.duration_ticks));

  return (
    <div
      className="absolute inset-0"
      style={{
        width: totalTicks * pxPerTick,
        height: 128 * NOTE_HEIGHT,
        cursor: editMode === "draw" ? "crosshair" : editMode === "erase" ? "not-allowed" : "default",
      }}
      onClick={handleLayerClick}
    >
      {notes.map((note) => (
        <NoteBlock
          key={note.id}
          note={note}
          pxPerTick={pxPerTick}
          isSelected={selectedIds.has(note.id)}
          quantize={quantize}
          onSelect={handleSelect}
          onDelete={handleDelete}
          onMove={handleMove}
          onResize={handleResize}
        />
      ))}
    </div>
  );
}
