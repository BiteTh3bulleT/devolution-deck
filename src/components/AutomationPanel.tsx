import { useMemo, useRef, useState } from "react";
import { useAutomationStore } from "../stores/automationStore";
import { useProjectStore } from "../stores/projectStore";

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

interface EditorPoint {
  id: string;
  x: number;
  y: number;
}

export function AutomationPanel() {
  const project = useProjectStore((s) => s.project);
  const selectedLaneId = useAutomationStore((s) => s.selectedLaneId);
  const selectedTrackId = useAutomationStore((s) => s.selectedTrackId);
  const selectedParameter = useAutomationStore((s) => s.selectedParameter);
  const setSelectedTrack = useAutomationStore((s) => s.setSelectedTrack);
  const setSelectedParameter = useAutomationStore((s) => s.setSelectedParameter);
  const ensureLane = useAutomationStore((s) => s.ensureLane);
  const addPoint = useAutomationStore((s) => s.addPoint);
  const updatePoint = useAutomationStore((s) => s.updatePoint);
  const deletePoint = useAutomationStore((s) => s.deletePoint);
  const toggleLaneEnabled = useAutomationStore((s) => s.toggleLaneEnabled);
  const selectLane = useAutomationStore((s) => s.selectLane);

  const [dragPointId, setDragPointId] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const tracks = project?.tracks ?? [];
  const timelineDuration = useMemo(() => {
    const clipEnds = tracks.flatMap((track) => [
      ...track.clips.map((clip) => clip.start_secs + clip.duration_secs),
      ...track.midi_clips.map((clip) => clip.start_secs + clip.duration_secs),
    ]);
    return Math.max(60, ...clipEnds, 60);
  }, [tracks]);

  const lane = project?.automation_lanes.find((entry) => entry.id === selectedLaneId)
    ?? project?.automation_lanes.find(
      (entry) => entry.track_id === selectedTrackId && entry.parameter === selectedParameter
    );

  const editorPoints: EditorPoint[] = useMemo(() => {
    if (!lane) return [];
    return lane.points.map((point) => ({
      id: point.id,
      x: (point.time_secs / timelineDuration) * 100,
      y: (1 - point.value) * 100,
    }));
  }, [lane, timelineDuration]);

  if (!project) {
    return <p className="text-xs text-deck-text-muted">No project loaded.</p>;
  }

  const handleCreateLane = async () => {
    if (!selectedTrackId) return;
    const created = await ensureLane(selectedTrackId, selectedParameter);
    selectLane(created.id);
  };

  const handleEditorClick = async (event: React.MouseEvent<HTMLDivElement>) => {
    if (!lane || !editorRef.current) return;
    if (dragPointId) return;
    const rect = editorRef.current.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const y = clamp(event.clientY - rect.top, 0, rect.height);
    const time_secs = (x / rect.width) * timelineDuration;
    const value = 1 - y / rect.height;
    await addPoint(lane.id, {
      time_secs,
      value: clamp(value, 0, 1),
      curve: 0,
    });
  };

  const dragTo = async (pointId: string, clientX: number, clientY: number) => {
    if (!lane || !editorRef.current) return;
    const rect = editorRef.current.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, rect.width);
    const y = clamp(clientY - rect.top, 0, rect.height);
    await updatePoint(lane.id, pointId, {
      time_secs: (x / rect.width) * timelineDuration,
      value: clamp(1 - y / rect.height, 0, 1),
    });
  };

  const handlePointMouseDown = (pointId: string) => {
    setDragPointId(pointId);

    const handleGlobalMouseMove = (event: MouseEvent) => {
      void dragTo(pointId, event.clientX, event.clientY);
    };
    const handleGlobalMouseUp = () => {
      setDragPointId(null);
      document.removeEventListener("mousemove", handleGlobalMouseMove);
      document.removeEventListener("mouseup", handleGlobalMouseUp);
    };

    document.addEventListener("mousemove", handleGlobalMouseMove);
    document.addEventListener("mouseup", handleGlobalMouseUp);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={selectedTrackId ?? ""}
          onChange={(event) => setSelectedTrack(event.target.value || null)}
          className="flex-1 bg-deck-panel border border-deck-border rounded px-2 py-1 text-xs"
        >
          <option value="">Track</option>
          {tracks.map((track) => (
            <option key={track.id} value={track.id}>
              {track.name}
            </option>
          ))}
        </select>
        <select
          value={selectedParameter}
          onChange={(event) => setSelectedParameter(event.target.value)}
          className="bg-deck-panel border border-deck-border rounded px-2 py-1 text-xs"
        >
          <option value="volume_db">Volume</option>
          <option value="pan">Pan</option>
        </select>
        <button
          type="button"
          onClick={() => void handleCreateLane()}
          className="px-2 py-1 rounded text-xs border border-deck-border bg-deck-muted hover:bg-deck-graphite"
        >
          Lane
        </button>
      </div>

      <div className="flex items-center justify-between text-[11px] text-deck-text-muted">
        <span>
          {lane ? `${lane.parameter} • ${lane.points.length} points` : "No lane for selected track/parameter"}
        </span>
        {lane && (
          <button
            type="button"
            onClick={() => void toggleLaneEnabled(lane.id)}
            className={[
              "px-2 py-0.5 rounded border",
              lane.enabled
                ? "border-deck-cyan/40 text-deck-cyan bg-deck-cyan/10"
                : "border-deck-border text-deck-text-muted bg-deck-muted",
            ].join(" ")}
          >
            {lane.enabled ? "Enabled" : "Bypassed"}
          </button>
        )}
      </div>

      <div
        ref={editorRef}
        onClick={(event) => void handleEditorClick(event)}
        className="relative h-36 rounded border border-deck-border bg-deck-panel overflow-hidden"
      >
        <svg className="absolute inset-0 h-full w-full">
          {editorPoints.length >= 2 && (
            <polyline
              fill="none"
              stroke="rgba(34, 211, 238, 0.9)"
              strokeWidth="2"
              points={editorPoints.map((point) => `${point.x},${point.y}`).join(" ")}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {lane?.points.map((point) => {
          const x = (point.time_secs / timelineDuration) * 100;
          const y = (1 - point.value) * 100;
          return (
            <button
              key={point.id}
              type="button"
              className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full border border-deck-cyan bg-deck-bg"
              style={{ left: `${x}%`, top: `${y}%` }}
              onMouseDown={(event) => {
                event.preventDefault();
                handlePointMouseDown(point.id);
              }}
              onDoubleClick={() => void deletePoint(lane.id, point.id)}
              title={`t=${point.time_secs.toFixed(2)}s v=${point.value.toFixed(2)} curve=${point.curve.toFixed(2)}`}
            />
          );
        })}
      </div>
      <p className="text-[10px] text-deck-text-muted">
        Click to add points, drag points to edit, double-click a point to delete.
      </p>
    </div>
  );
}
