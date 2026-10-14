import { useRef, useState } from "react";
import knobCap from "../../assets/ui/v5/knob-cap.png";
import knobBezel from "../../assets/ui/v5/knob-bezel.png";
import jogDial from "../../assets/ui/v5/jog-dial.png";

interface KnobProps {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (value: number) => void; unit?: string; resetValue?: number; disabled?: boolean;
}
/** A native range retains keyboard/AT support; pointer drag uses the hardware's vertical gesture. */
export function HardwareKnob({ label, value, min, max, step = 0.01, onChange, unit = "", resetValue, disabled }: KnobProps) {
  const drag = useRef<{ id: number; y: number; value: number; latest: number; sent: number } | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const shown = preview ?? value;
  const fraction = Math.max(0, Math.min(1, (shown - min) / (max - min)));
  const quantize = (n: number) => Math.max(min, Math.min(max, Math.round((n - min) / step) * step + min));
  return <label className={`hardware-knob ${disabled ? "is-disabled" : ""}`}>
    <span className="hardware-control-label">{label}</span>
    <span className="hardware-knob-face">
      <img src={knobBezel} alt="" draggable={false} className="hardware-knob-bezel" />
      <img src={knobCap} alt="" draggable={false} className="hardware-knob-cap" style={{ transform: `rotate(${-135 + fraction * 270}deg)` }} />
      <input type="range" aria-label={label} aria-valuetext={`${value.toFixed(step < 1 ? 2 : 0)} ${unit}`} min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={e => { if (!drag.current) onChange(Number(e.target.value)); }}
        onPointerDown={e => { if (disabled || e.button !== 0 || drag.current) return; e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { id:e.pointerId, y:e.clientY, value, latest:value, sent:performance.now() }; setPreview(value); }}
        onPointerMove={e => { const active=drag.current; if (!active || active.id !== e.pointerId) return; active.latest=quantize(active.value + (active.y - e.clientY) * (max - min) / (e.shiftKey ? 1200 : 180)); setPreview(active.latest); if (performance.now()-active.sent >= 33) { active.sent=performance.now(); onChange(active.latest); } }}
        onPointerUp={e => { if (drag.current?.id !== e.pointerId) return; onChange(drag.current.latest); drag.current=null; setPreview(null); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
        onPointerCancel={e => { if (drag.current?.id === e.pointerId) { onChange(drag.current.latest); drag.current=null; setPreview(null); } }} onLostPointerCapture={e => { if (drag.current?.id === e.pointerId) { onChange(drag.current.latest); drag.current=null; setPreview(null); } }}
        onDoubleClick={() => { if (resetValue !== undefined) onChange(resetValue); }}
        title={`${label}: drag up/down; Shift for fine control; arrow keys to adjust${resetValue !== undefined ? "; double-click to reset" : ""}`} />
    </span>
    <output className="hardware-control-value">{shown.toFixed(step < 1 ? (max <= 2 ? 2 : 1) : 0)}<small>{unit}</small></output>
  </label>;
}

export function JogDial({ label, position, disabled, vinylMode, onScratch, onNudge }: { label: string; position: number; disabled: boolean; vinylMode: boolean; onScratch: (seconds: number) => void; onNudge: (beats: number) => void }) {
  const drag = useRef<{id:number; x:number; width:number} | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  return <button type="button" className="hardware-jog" aria-label={label} disabled={disabled} title={`Drag then release to ${vinylMode ? "scratch" : "nudge"}; arrow keys to nudge by a quarter beat`}
    onPointerDown={e => { if (e.button !== 0 || disabled || drag.current) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = {id:e.pointerId,x:e.clientX,width:e.currentTarget.getBoundingClientRect().width}; }}
    onPointerMove={e => { if (drag.current?.id === e.pointerId) setDragOffset((e.clientX-drag.current.x)*190/drag.current.width); }}
    onPointerUp={e => { if (drag.current?.id !== e.pointerId) return; const delta=(e.clientX-drag.current.x)*1.9/drag.current.width; drag.current=null; setDragOffset(0); if (Math.abs(delta)>0.01) { if (vinylMode) onScratch(delta); else onNudge(delta); } if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
    onPointerCancel={e => { if (drag.current?.id === e.pointerId) { drag.current=null; setDragOffset(0); } }} onLostPointerCapture={e => { if (drag.current?.id === e.pointerId) { drag.current=null; setDragOffset(0); } }}
    onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); onNudge(e.key === "ArrowLeft" ? -.25 : .25); } }}>
    <img src={jogDial} alt="" draggable={false} style={{ transform: `rotate(${position * 90 + dragOffset * 2}deg)` }} />
    <span className="hardware-jog-hub" aria-hidden="true">DΞ</span>
  </button>;
}
