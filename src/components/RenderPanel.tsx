import { useMemo, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import * as api from "../api";
import { useProjectStore } from "../stores/projectStore";
import { useTransportStore } from "../stores/transportStore";

const DEFAULT_EXPORT_DIR = "/tmp/devolution_deck_exports";

function formatTime(unixMs: number): string {
  return new Date(unixMs).toLocaleString();
}

export function RenderPanel() {
  const project = useProjectStore((s) => s.project);
  const setProject = useProjectStore((s) => s.setProject);
  const positionSecs = useTransportStore((s) => s.positionSecs);

  const [outputDir, setOutputDir] = useState(DEFAULT_EXPORT_DIR);
  const [trackId, setTrackId] = useState("");
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(8);
  const [includeMuted, setIncludeMuted] = useState(false);
  const [skipSilentTracks, setSkipSilentTracks] = useState(true);
  const [filenamePrefix, setFilenamePrefix] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tracks = project?.tracks ?? [];
  const selectedTrack = useMemo(() => tracks.find((track) => track.id === trackId), [tracks, trackId]);

  if (!project) {
    return <p className="text-xs text-deck-text-muted">No project loaded.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-widest text-deck-cyan">Render / Freeze / Stems</h3>
        <button
          type="button"
          onClick={() => {
            setRangeStart(Math.max(0, Number(positionSecs.toFixed(2))));
            setRangeEnd(Math.max(0.25, Number((positionSecs + 8).toFixed(2))));
          }}
          className="px-2 py-1 rounded text-[11px] border border-deck-border bg-deck-muted"
        >
          Use Playhead
        </button>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Output Directory</p>
        <div className="flex gap-1">
          <input
            value={outputDir}
            onChange={(event) => setOutputDir(event.target.value)}
            className="flex-1 rounded border border-deck-border bg-deck-surface px-2 py-1 text-[11px]"
          />
          <button
            type="button"
            onClick={async () => {
              const selected = await openDialog({ directory: true, multiple: false });
              if (selected && typeof selected === "string") {
                setOutputDir(selected);
              }
            }}
            className="px-2 py-1 rounded text-[11px] border border-deck-border bg-deck-muted"
          >
            Browse
          </button>
        </div>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Stem Export</p>
        <label className="text-[11px] text-deck-text-muted flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeMuted}
            onChange={(event) => setIncludeMuted(event.target.checked)}
          />
          Include muted tracks
        </label>
        <label className="text-[11px] text-deck-text-muted flex items-center gap-2">
          <input
            type="checkbox"
            checked={skipSilentTracks}
            onChange={(event) => setSkipSilentTracks(event.target.checked)}
          />
          Skip silent tracks
        </label>
        <label className="text-[11px] text-deck-text-muted flex flex-col gap-1">
          Filename Prefix
          <input
            value={filenamePrefix}
            onChange={(event) => setFilenamePrefix(event.target.value)}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1 text-[11px]"
            placeholder="optional prefix, e.g. showA"
          />
        </label>
        <button
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("stem");
            setError(null);
            try {
              const job = await api.stemExportStart({
                output_dir: outputDir,
                include_muted: includeMuted,
                skip_silent_tracks: skipSilentTracks,
                filename_prefix: filenamePrefix.trim() || undefined,
              });
              if (project) {
                const nextJobs = [...project.render_jobs, job].slice(-400);
                setProject({
                  ...project,
                  render_jobs: nextJobs,
                });
              }
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(null);
            }
          }}
          className="w-full rounded border border-deck-cyan/40 bg-deck-cyan/10 text-deck-cyan text-[11px] px-2 py-1 disabled:opacity-50"
        >
          Export Stems
        </button>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Track Freeze / Render In Place</p>
        <select
          value={trackId}
          onChange={(event) => setTrackId(event.target.value)}
          className="w-full rounded border border-deck-border bg-deck-surface px-2 py-1 text-[11px]"
        >
          <option value="">Select track</option>
          {tracks.map((track) => (
            <option key={track.id} value={track.id}>
              {track.name}
            </option>
          ))}
        </select>

        {selectedTrack && (
          <div className="text-[10px] text-deck-text-muted">
            {selectedTrack.freeze_state.is_frozen ? "Frozen" : "Not frozen"}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <label className="flex flex-col gap-1 text-deck-text-muted">
            Start (s)
            <input
              type="number"
              min={0}
              step={0.01}
              value={rangeStart}
              onChange={(event) => setRangeStart(Number(event.target.value))}
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-deck-text-muted">
            End (s)
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={rangeEnd}
              onChange={(event) => setRangeEnd(Number(event.target.value))}
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            disabled={!selectedTrack || busy !== null}
            onClick={async () => {
              if (!selectedTrack) return;
              setBusy("freeze");
              setError(null);
            try {
                const updatedTrack = await api.trackFreeze(selectedTrack.id, outputDir);
                if (project) {
                  setProject({
                    ...project,
                    tracks: project.tracks.map((track) =>
                      track.id === updatedTrack.id ? updatedTrack : track
                    ),
                  });
                }
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(null);
              }
            }}
            className="px-2 py-1 rounded text-[11px] border border-deck-border bg-deck-muted disabled:opacity-50"
          >
            Freeze
          </button>
          <button
            type="button"
            disabled={!selectedTrack || busy !== null}
            onClick={async () => {
              if (!selectedTrack) return;
              setBusy("unfreeze");
              setError(null);
            try {
                const updatedTrack = await api.trackUnfreeze(selectedTrack.id);
                if (project) {
                  setProject({
                    ...project,
                    tracks: project.tracks.map((track) =>
                      track.id === updatedTrack.id ? updatedTrack : track
                    ),
                  });
                }
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(null);
              }
            }}
            className="px-2 py-1 rounded text-[11px] border border-deck-border bg-deck-muted disabled:opacity-50"
          >
            Unfreeze
          </button>
          <button
            type="button"
            disabled={!selectedTrack || busy !== null || rangeEnd <= rangeStart}
            onClick={async () => {
              if (!selectedTrack) return;
              setBusy("rip");
              setError(null);
            try {
                const updatedTrack = await api.trackRenderInPlace(
                  selectedTrack.id,
                  rangeStart,
                  rangeEnd,
                  outputDir
                );
                if (project) {
                  setProject({
                    ...project,
                    tracks: project.tracks.map((track) =>
                      track.id === updatedTrack.id ? updatedTrack : track
                    ),
                  });
                }
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(null);
              }
            }}
            className="px-2 py-1 rounded text-[11px] border border-deck-cyan/30 bg-deck-cyan/10 text-deck-cyan disabled:opacity-50"
          >
            Render In Place
          </button>
        </div>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted mb-1">Render Jobs</p>
        <div className="space-y-1 max-h-40 overflow-auto">
          {project.render_jobs.length === 0 && (
            <p className="text-[11px] text-deck-text-muted">No render jobs yet.</p>
          )}
          {project.render_jobs
            .slice()
            .reverse()
            .map((job) => (
              <div key={job.id} className="rounded border border-deck-border p-1.5 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-deck-text">{job.kind}</span>
                  <span className="text-deck-text-muted">{job.status}</span>
                </div>
                <div className="text-deck-text-muted">{formatTime(job.created_unix_ms)}</div>
                {job.output_files.length > 0 && (
                  <div className="mt-1 text-deck-cyan truncate" title={job.output_files.join("\n")}>
                    {job.output_files[0]}
                    {job.output_files.length > 1 && ` (+${job.output_files.length - 1} more)`}
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>

      {error && <p className="text-[11px] text-red-300">{error}</p>}
    </div>
  );
}
