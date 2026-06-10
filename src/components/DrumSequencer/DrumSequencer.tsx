/**
 * DrumSequencer — 16-step grid panel.
 * Opens for MIDI tracks with plugin_type = "builtin_drums".
 * "Commit to clip" writes a MidiClip with generated MidiNote array.
 */

import { useState, useCallback } from "react";
import type { DrumRow as DrumRowType, MidiClip, Track } from "../../types";
import { DEFAULT_DRUM_PITCHES, TICKS_PER_BEAT } from "../../types";
import { DrumRow } from "./DrumRow";
import { v4 as uuidv4 } from "../../utils/uuid";
import * as api from "../../api";
import { useProjectStore } from "../../stores/projectStore";

const STEPS = 16;
const STEP_TICKS = TICKS_PER_BEAT / 4; // 1/16 per step
const PATTERN_TICKS = STEPS * STEP_TICKS; // 1 bar

function makeEmptyRows(): DrumRowType[] {
  return DEFAULT_DRUM_PITCHES.map(({ pitch, label }) => ({
    pitch,
    label,
    steps: Array.from({ length: STEPS }, () => ({ active: false, velocity: 100 })),
  }));
}

interface DrumSequencerProps {
  track: Track;
  onClose(): void;
}

export function DrumSequencer({ track, onClose }: DrumSequencerProps) {
  const [rows, setRows] = useState<DrumRowType[]>(makeEmptyRows);
  const load = useProjectStore((s) => s.load);
  const projectBpm = useProjectStore((s) => s.project?.bpm ?? 120);

  const toggleStep = useCallback((rowIndex: number, stepIndex: number) => {
    setRows((prev) =>
      prev.map((row, ri) =>
        ri !== rowIndex
          ? row
          : {
              ...row,
              steps: row.steps.map((step, si) =>
                si !== stepIndex ? step : { ...step, active: !step.active }
              ),
            }
      )
    );
  }, []);

  const commitToClip = useCallback(async () => {
    const notes = rows.flatMap((row) =>
      row.steps
        .map((step, si) =>
          step.active
            ? {
                id: uuidv4(),
                pitch: row.pitch,
                start_ticks: si * STEP_TICKS,
                duration_ticks: STEP_TICKS - 10,
                velocity: step.velocity,
              }
            : null
        )
        .filter(Boolean)
    ) as MidiClip["notes"];

    try {
      const durationSecs = (PATTERN_TICKS / TICKS_PER_BEAT) * (60 / Math.max(1, projectBpm));
      const existing =
        track.midi_clips.find((clip) => clip.loop_clip && clip.start_secs === 0) ??
        track.midi_clips.find((clip) => clip.loop_clip);
      if (existing) {
        await api.midiClipUpdate(track.id, { ...existing, notes });
      } else {
        const clip = await api.midiClipAdd({
          track_id: track.id,
          start_secs: 0,
          duration_secs: durationSecs,
        });
        await api.midiClipUpdate(track.id, { ...clip, notes, loop_clip: true });
      }
      await load();
    } catch (e) {
      console.error("DrumSequencer commitToClip failed", e);
    }
  }, [rows, track, projectBpm, load]);

  const clearAll = useCallback(() => setRows(makeEmptyRows), []);

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-deck-bg border-t border-deck-border">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-1.5 bg-deck-panel border-b border-deck-border shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1 rounded text-xs bg-deck-muted hover:bg-deck-graphite text-deck-text-muted"
        >
          ← Back
        </button>
        <div className="w-px h-4 bg-deck-border" />
        <span className="text-xs font-display text-deck-text-muted uppercase tracking-widest">
          {track.name} — Drum Sequencer
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={clearAll}
          className="px-3 py-1 rounded text-xs bg-deck-muted hover:bg-deck-graphite text-deck-text-muted"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={commitToClip}
          className="px-3 py-1 rounded text-xs bg-deck-accent hover:bg-deck-accent-dim text-white font-semibold"
        >
          Commit to Clip
        </button>
      </div>

      {/* Step columns header */}
      <div className="flex items-center gap-1.5 px-3 py-1 bg-deck-surface border-b border-deck-border shrink-0">
        <div className="w-12 shrink-0" />
        <div className="flex gap-0.5">
          {Array.from({ length: STEPS }, (_, i) => (
            <div
              key={i}
              className={[
                "w-7 text-center text-[9px] font-mono text-deck-text-muted/40",
                i % 4 === 0 && i > 0 ? "ml-1.5" : "",
              ].join(" ")}
            >
              {i % 4 === 0 ? i / 4 + 1 : "·"}
            </div>
          ))}
        </div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {rows.map((row, ri) => (
          <DrumRow
            key={row.pitch}
            label={row.label}
            steps={row.steps}
            onToggle={(si) => toggleStep(ri, si)}
          />
        ))}
      </div>
    </div>
  );
}
