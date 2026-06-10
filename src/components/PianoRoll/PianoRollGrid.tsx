/**
 * PianoRollGrid — canvas background grid.
 * Draws: bar lines (thick), beat lines (medium), quantize lines (thin),
 * black-key row fills, C-note highlights.
 */

import { useEffect, useRef } from "react";
import type { QuantizeDivision } from "../../types";
import { TICKS_PER_BEAT, DIVISION_TICKS } from "../../types";
import { NOTE_HEIGHT } from "./PianoKeys";

const BLACK_KEY_INDICES = new Set([1, 3, 6, 8, 10]);

interface PianoRollGridProps {
  pxPerTick: number;
  totalTicks: number;
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
  quantize: QuantizeDivision;
}

export function PianoRollGrid({
  pxPerTick,
  totalTicks,
  scrollX,
  scrollY,
  width,
  height,
  quantize,
}: PianoRollGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio ?? 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Horizontal rows (pitch rows)
    const firstRow = Math.floor(scrollY / NOTE_HEIGHT);
    const lastRow = Math.min(127, firstRow + Math.ceil(height / NOTE_HEIGHT) + 1);
    for (let i = firstRow; i <= lastRow; i++) {
      const pitch = 127 - i;
      const noteIndex = pitch % 12;
      const y = i * NOTE_HEIGHT - scrollY;
      if (BLACK_KEY_INDICES.has(noteIndex)) {
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(0, y, width, NOTE_HEIGHT);
      }
      if (noteIndex === 0) {
        ctx.strokeStyle = "rgba(34, 211, 238, 0.25)";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    // Vertical lines
    const divTicks = DIVISION_TICKS[quantize];
    const barTicks = TICKS_PER_BEAT * 4;
    const firstTick = Math.floor(scrollX / pxPerTick);
    const lastTick = firstTick + Math.ceil(width / pxPerTick) + divTicks;

    // Align to grid
    const startTick = Math.floor(firstTick / divTicks) * divTicks;

    for (let t = startTick; t <= lastTick; t += divTicks) {
      const x = t * pxPerTick - scrollX;
      if (x < 0 || x > width) continue;

      const isBar = t % barTicks === 0;
      const isBeat = t % TICKS_PER_BEAT === 0;

      if (isBar) {
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 1;
      } else if (isBeat) {
        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        ctx.lineWidth = 0.5;
      } else {
        ctx.strokeStyle = "rgba(255,255,255,0.03)";
        ctx.lineWidth = 0.5;
      }
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Bar number labels
      if (isBar) {
        const barNum = t / barTicks + 1;
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.font = "9px JetBrains Mono, monospace";
        ctx.fillText(String(barNum), x + 2, 10);
      }
    }
  }, [pxPerTick, totalTicks, scrollX, scrollY, width, height, quantize]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    />
  );
}
