import { useEffect, useMemo, useState } from "react";
import * as api from "../api";
import { useProjectStore } from "../stores/projectStore";

export function CompingPanel() {
  const project = useProjectStore((s) => s.project);
  const load = useProjectStore((s) => s.load);

  const [trackId, setTrackId] = useState("");
  const [laneId, setLaneId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [clipStart, setClipStart] = useState(0);
  const [clipDuration, setClipDuration] = useState(4);
  const [sourceOffset, setSourceOffset] = useState(0);
  const [compStart, setCompStart] = useState(0);
  const [compEnd, setCompEnd] = useState(4);
  const [fadeSecs, setFadeSecs] = useState(0.01);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioTracks = useMemo(
    () => (project?.tracks ?? []).filter((track) => track.track_type === "audio"),
    [project?.tracks]
  );
  const selectedTrack = useMemo(() => audioTracks.find((track) => track.id === trackId), [audioTracks, trackId]);
  const selectedLane = useMemo(
    () => selectedTrack?.take_lanes.find((lane) => lane.id === laneId) ?? null,
    [selectedTrack, laneId]
  );

  useEffect(() => {
    if (!selectedTrack) {
      setLaneId("");
      return;
    }
    if (!selectedTrack.take_lanes.some((lane) => lane.id === laneId)) {
      setLaneId(selectedTrack.take_lanes[0]?.id ?? "");
    }
  }, [laneId, selectedTrack]);

  useEffect(() => {
    if (!project) return;
    if (project.media.length > 0 && !project.media.some((asset) => asset.id === assetId)) {
      setAssetId(project.media[0].id);
    }
  }, [assetId, project]);

  if (!project) {
    return <p className="text-xs text-deck-text-muted">No project loaded.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-widest text-deck-cyan">Take Lanes / Comping</h3>
        <button
          type="button"
          disabled={!selectedTrack || busy !== null}
          onClick={async () => {
            if (!selectedTrack) return;
            setBusy("lane");
            setError(null);
            try {
              await api.takeLaneAdd(selectedTrack.id);
              await load();
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(null);
            }
          }}
          className="px-2 py-1 rounded text-[11px] border border-deck-border bg-deck-muted disabled:opacity-50"
        >
          + Take Lane
        </button>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <label className="text-[11px] text-deck-text-muted flex flex-col gap-1">
          Target Track
          <select
            value={trackId}
            onChange={(event) => setTrackId(event.target.value)}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1"
          >
            <option value="">Select track</option>
            {audioTracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[11px] text-deck-text-muted flex flex-col gap-1">
          Take Lane
          <select
            value={laneId}
            onChange={(event) => setLaneId(event.target.value)}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            disabled={!selectedTrack}
          >
            <option value="">Select lane</option>
            {(selectedTrack?.take_lanes ?? []).map((lane) => (
              <option key={lane.id} value={lane.id}>
                {lane.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Add Take Clip</p>
        <label className="text-[11px] text-deck-text-muted flex flex-col gap-1">
          Source Asset
          <select
            value={assetId}
            onChange={(event) => setAssetId(event.target.value)}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1"
          >
            <option value="">Select media</option>
            {project.media.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <label className="text-deck-text-muted flex flex-col gap-1">
            Start
            <input
              type="number"
              min={0}
              step={0.01}
              value={clipStart}
              onChange={(event) => setClipStart(Number(event.target.value))}
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            />
          </label>
          <label className="text-deck-text-muted flex flex-col gap-1">
            Duration
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={clipDuration}
              onChange={(event) => setClipDuration(Number(event.target.value))}
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            />
          </label>
          <label className="text-deck-text-muted flex flex-col gap-1">
            Source Offset
            <input
              type="number"
              min={0}
              step={0.01}
              value={sourceOffset}
              onChange={(event) => setSourceOffset(Number(event.target.value))}
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={!trackId || !laneId || !assetId || busy !== null}
          onClick={async () => {
            if (!trackId || !laneId || !assetId) return;
            setBusy("take");
            setError(null);
            try {
              await api.takeLaneClipAdd({
                trackId,
                laneId,
                mediaAssetId: assetId,
                startSecs: clipStart,
                sourceOffsetSecs: sourceOffset,
                durationSecs: clipDuration,
              });
              await load();
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(null);
            }
          }}
          className="w-full rounded border border-deck-cyan/40 bg-deck-cyan/10 text-deck-cyan text-[11px] px-2 py-1 disabled:opacity-50"
        >
          Add Clip To Lane
        </button>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Comp Regions</p>
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <label className="text-deck-text-muted flex flex-col gap-1">
            Start
            <input
              type="number"
              min={0}
              step={0.01}
              value={compStart}
              onChange={(event) => setCompStart(Number(event.target.value))}
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            />
          </label>
          <label className="text-deck-text-muted flex flex-col gap-1">
            End
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={compEnd}
              onChange={(event) => setCompEnd(Number(event.target.value))}
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            />
          </label>
          <label className="text-deck-text-muted flex flex-col gap-1">
            Fade
            <input
              type="number"
              min={0}
              max={2}
              step={0.01}
              value={fadeSecs}
              onChange={(event) => setFadeSecs(Number(event.target.value))}
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            />
          </label>
        </div>

        <div className="space-y-1 max-h-32 overflow-auto">
          {(selectedLane?.clips ?? []).map((clip) => (
            <div key={clip.id} className="rounded border border-deck-border p-1.5 text-[10px]">
              <div className="flex items-center justify-between text-deck-text-muted">
                <span>
                  {clip.start_secs.toFixed(2)}s - {(clip.start_secs + clip.duration_secs).toFixed(2)}s
                </span>
                <button
                  type="button"
                  disabled={!trackId || !laneId || busy !== null}
                  onClick={async () => {
                    if (!trackId || !laneId) return;
                    setBusy("comp");
                    setError(null);
                    try {
                      const start = Math.max(compStart, clip.start_secs);
                      const end = Math.min(compEnd, clip.start_secs + clip.duration_secs);
                      if (end <= start) {
                        setError("Comp region does not overlap with this clip.");
                        return;
                      }
                      await api.compRegionSet({
                        trackId,
                        laneId,
                        takeClipId: clip.id,
                        startSecs: start,
                        endSecs: Math.max(start + 0.01, end),
                        fadeSecs,
                      });
                      await load();
                    } catch (e) {
                      setError(String(e));
                    } finally {
                      setBusy(null);
                    }
                  }}
                  className="px-1.5 py-0.5 rounded border border-deck-magenta/40 text-deck-magenta disabled:opacity-50"
                >
                  Use In Comp
                </button>
              </div>
            </div>
          ))}
          {(selectedLane?.clips.length ?? 0) === 0 && (
            <p className="text-[11px] text-deck-text-muted">No take clips in selected lane.</p>
          )}
        </div>

        <div className="space-y-1 max-h-28 overflow-auto">
          {(selectedTrack?.comp_regions ?? []).map((region) => (
            <div key={region.id} className="rounded border border-deck-border p-1.5 text-[10px]">
              <div className="flex justify-between items-center">
                <span className="text-deck-text-muted">
                  {region.start_secs.toFixed(2)}s - {region.end_secs.toFixed(2)}s (fade {region.fade_secs.toFixed(2)}s)
                </span>
                <button
                  type="button"
                  disabled={!trackId || busy !== null}
                  onClick={async () => {
                    if (!trackId) return;
                    setBusy("clear_comp");
                    setError(null);
                    try {
                      await api.compRegionClear(trackId, region.id);
                      await load();
                    } catch (e) {
                      setError(String(e));
                    } finally {
                      setBusy(null);
                    }
                  }}
                  className="text-red-300"
                >
                  Del
                </button>
              </div>
            </div>
          ))}
          {(selectedTrack?.comp_regions.length ?? 0) === 0 && (
            <p className="text-[11px] text-deck-text-muted">No comp regions on this track.</p>
          )}
        </div>
      </div>

      {error && <p className="text-[11px] text-red-300">{error}</p>}
    </div>
  );
}
