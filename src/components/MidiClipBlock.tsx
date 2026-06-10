/**
 * MidiClipBlock — renders a MIDI clip on the timeline.
 * Shows a dot-matrix note preview instead of a waveform.
 * Double-click opens the piano roll.
 */

import { useCallback, useRef } from "react";
import type { MidiClip } from "../types";
import { TICKS_PER_BEAT } from "../types";
import { useMidiStore } from "../stores/midiStore";
import { useProjectStore } from "../stores/projectStore";

interface MidiClipBlockProps {
  clip: MidiClip;
  trackId: string;
  pixelsPerSec: number;
  trackHeight: number;
}

export function MidiClipBlock({ clip, trackId, pixelsPerSec, trackHeight }: MidiClipBlockProps) {
  const openPianoRoll = useMidiStore((s) => s.openPianoRoll);
  const bpm = useProjectStore((s) => s.project?.bpm ?? 120);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const left = clip.start_secs * pixelsPerSec;
  const width = Math.max(24, clip.duration_secs * pixelsPerSec);
  const height = trackHeight - 4;

  const handleDoubleClick = useCallback(() => {
    openPianoRoll(trackId, clip);
  }, [openPianoRoll, trackId, clip]);

  // Draw note preview dots on canvas
  const drawNotes = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return;
      const dpr = window.devicePixelRatio ?? 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      if (clip.notes.length === 0) return;

      const pitches = clip.notes.map((n) => n.pitch);
      const minPitch = Math.min(...pitches);
      const maxPitch = Math.max(...pitches);
      const pitchRange = Math.max(maxPitch - minPitch, 12);

      // Total ticks in clip (use actual project BPM)
      const clipTicks = (clip.duration_secs / 60) * TICKS_PER_BEAT * bpm;

      for (const note of clip.notes) {
        const nx = (note.start_ticks / Math.max(clipTicks, 480)) * (width - 2) + 1;
        const nw = Math.max(2, (note.duration_ticks / Math.max(clipTicks, 480)) * (width - 2));
        const ny = height - ((note.pitch - minPitch) / pitchRange) * (height - 6) - 3;
        ctx.fillStyle = "rgba(232, 121, 249, 0.85)"; // magenta
        ctx.fillRect(nx, ny, nw, 2);
      }
    },
    [clip, width, height, bpm]
  );

  return (
    <div
      className="absolute top-0.5 rounded border border-deck-magenta/40 bg-deck-surface/80 hover:border-deck-magenta/80 transition-colors cursor-pointer overflow-hidden"
      style={{ left, width, height, bottom: 2 }}
      onDoubleClick={handleDoubleClick}
      title={`MIDI clip — ${clip.notes.length} notes — dbl-click to edit`}
    >
      <div className="flex items-center gap-1 px-1.5 pt-0.5">
        <span className="text-[9px] font-mono text-deck-magenta uppercase tracking-wide select-none shrink-0">
          MIDI
        </span>
        <span className="text-[9px] font-mono text-deck-text-muted select-none truncate">
          {clip.notes.length}n
        </span>
      </div>
      <canvas
        ref={(el) => {
          (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = el;
          drawNotes(el);
        }}
        style={{ width, height: height - 16, display: "block" }}
      />
    </div>
  );
}
