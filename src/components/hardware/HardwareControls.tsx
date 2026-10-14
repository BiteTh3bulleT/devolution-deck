import { useRef, useState } from "react";
import knobCap from "../../assets/ui/v5/knob-cap.png";
import knobBezel from "../../assets/ui/v5/knob-bezel.png";

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

export { JogDial } from "./LiveJogDial";
