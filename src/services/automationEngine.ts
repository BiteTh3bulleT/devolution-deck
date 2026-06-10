import type { AutomationLane, AutomationPoint } from "../types";

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function curvedLerp(t: number, curve: number): number {
  const c = clamp(curve, -1, 1);
  if (Math.abs(c) < 0.001) return t;
  if (c > 0) {
    // Ease-out style.
    const k = 1 + c * 3;
    return 1 - Math.pow(1 - t, k);
  }
  // Ease-in style.
  const k = 1 + Math.abs(c) * 3;
  return Math.pow(t, k);
}

function interpolatePoints(
  left: AutomationPoint,
  right: AutomationPoint,
  timeSecs: number
): number {
  const dt = right.time_secs - left.time_secs;
  if (dt <= 0) return right.value;
  const t = clamp((timeSecs - left.time_secs) / dt, 0, 1);
  const shaped = curvedLerp(t, left.curve);
  return left.value + (right.value - left.value) * shaped;
}

export function evaluateAutomationLane(
  lane: AutomationLane | undefined,
  timeSecs: number,
  fallbackValue: number
): number {
  if (!lane || !lane.enabled || lane.points.length === 0) return fallbackValue;
  const points = [...lane.points].sort((a, b) => a.time_secs - b.time_secs);
  if (timeSecs <= points[0].time_secs) return points[0].value;
  const last = points[points.length - 1];
  if (timeSecs >= last.time_secs) return last.value;

  for (let i = 0; i < points.length - 1; i += 1) {
    const left = points[i];
    const right = points[i + 1];
    if (timeSecs >= left.time_secs && timeSecs <= right.time_secs) {
      return interpolatePoints(left, right, timeSecs);
    }
  }
  return fallbackValue;
}
