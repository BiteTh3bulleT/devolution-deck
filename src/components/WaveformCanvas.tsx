import { useRef, useEffect } from "react";

interface WaveformCanvasProps {
  buckets: { min: number; max: number }[];
  width: number;
  height: number;
}

const WAVEFORM_FILL = "rgba(124, 58, 237, 0.4)";
const WAVEFORM_STROKE = "rgba(124, 58, 237, 0.8)";

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

    ctx.fillStyle = WAVEFORM_FILL;
    ctx.strokeStyle = WAVEFORM_STROKE;
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
      className="w-full h-full block"
      style={{ width, height }}
    />
  );
}
