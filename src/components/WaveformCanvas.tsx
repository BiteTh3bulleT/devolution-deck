import { useRef, useEffect } from "react";

interface WaveformCanvasProps {
  buckets: { min: number; max: number }[];
  width: number;
  height: number;
}


export function WaveformCanvas({ buckets, width, height }: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || buckets.length === 0) return;

    const dpr = window.devicePixelRatio ?? 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    const midY = height / 2;
    const bucketWidth = width / buckets.length;

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--deck-cyan").trim() || "#7ccbd0";
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = 1;

    buckets.forEach((b, i) => {
      const x = i * bucketWidth;
      const range = Math.max(0.01, Math.abs(b.max - b.min));
      const halfH = (range / 2) * (height * 0.4);
      const top = midY - halfH;
      const bot = midY + halfH;
      ctx.fillRect(x, top, Math.max(1, bucketWidth + 1), bot - top);
    });
  }, [buckets, width, height]);

  return (
    <canvas
      ref={canvasRef}
      role="img" aria-label="Audio clip waveform"
      className="w-full h-full block"
      style={{ width, height }}
    />
  );
}
