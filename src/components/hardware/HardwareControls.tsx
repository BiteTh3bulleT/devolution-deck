import { useRef, useState } from "react";
import knobCap from "../../assets/ui/v3/knob-cap.png";
import knobBezel from "../../assets/ui/v3/knob-bezel.png";
import jogDial from "../../assets/ui/v3/jog-dial.png";

interface KnobProps {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (value: number) => void; unit?: string; resetValue?: number; disabled?: boolean;
}
/** A native range retains keyboard/AT support; pointer drag uses the hardware's vertical gesture. */
export function HardwareKnob({ label, value, min, max, step = 0.01, onChange, unit = "", resetValue, disabled }: KnobProps) {
  const drag = useRef<{ y: number; value: number } | null>(null);
  const fraction = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const quantize = (n: number) => Math.max(min, Math.min(max, Math.round((n - min) / step) * step + min));
  return <label className={`hardware-knob ${disabled ? "is-disabled" : ""}`}>
    <span className="hardware-control-label">{label}</span>
    <span className="hardware-knob-face">
      <img src={knobBezel} alt="" draggable={false} className="hardware-knob-bezel" />
      <img src={knobCap} alt="" draggable={false} className="hardware-knob-cap" style={{ transform: `rotate(${-135 + fraction * 270}deg)` }} />
      <input type="range" aria-label={label} aria-valuetext={`${value.toFixed(step < 1 ? 2 : 0)} ${unit}`} min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={e => { if (!drag.current) onChange(Number(e.target.value)); }}
        onPointerDown={e => { if (disabled || e.button !== 0) return; e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { y: e.clientY, value }; }}
        onPointerMove={e => { if (!drag.current) return; onChange(quantize(drag.current.value + (drag.current.y - e.clientY) * (max - min) / (e.shiftKey ? 1200 : 180))); }}
        onPointerUp={e => { drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
        onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
        onDoubleClick={() => { if (resetValue !== undefined) onChange(resetValue); }}
        title={`${label}: drag up/down; Shift for fine control; arrow keys to adjust${resetValue !== undefined ? "; double-click to reset" : ""}`} />
    </span>
    <output className="hardware-control-value">{value.toFixed(step < 1 ? (max <= 2 ? 2 : 1) : 0)}<small>{unit}</small></output>
  </label>;
}

export function JogDial({ label, position, disabled, vinylMode, onScratch, onNudge }: { label: string; position: number; disabled: boolean; vinylMode: boolean; onScratch: (seconds: number) => void; onNudge: (beats: number) => void }) {
  const drag = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  return <button type="button" className="hardware-jog" aria-label={label} disabled={disabled} title={`${vinylMode ? "Drag to scratch" : "Drag to nudge"}; arrow keys to nudge by a quarter beat`}
    onPointerDown={e => { if (e.button !== 0 || disabled) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = e.clientX; }}
    onPointerMove={e => { if (drag.current !== null) setDragOffset(e.clientX - drag.current); }}
    onPointerUp={e => { setDragOffset(0); if (drag.current !== null) { const delta = (e.clientX - drag.current) / 100; drag.current = null; if (Math.abs(delta) > 0.01) { if (vinylMode) onScratch(delta); else onNudge(delta); } } if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
    onPointerCancel={() => { drag.current = null; setDragOffset(0); }} onLostPointerCapture={() => { drag.current = null; setDragOffset(0); }}
    onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); onNudge(e.key === "ArrowLeft" ? -.25 : .25); } }}>
    <img src={jogDial} alt="" draggable={false} style={{ transform: `rotate(${position * 90 + dragOffset * 2}deg)` }} />
    <span className="hardware-jog-hub" aria-hidden="true">DΞ</span>
  </button>;
}
