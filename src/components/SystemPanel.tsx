import { useEffect, useState } from "react";
import * as api from "../api";
import type { MonitoringState, RecoverySnapshot } from "../types";
import { useProjectStore } from "../stores/projectStore";

function snapshotTime(unixMs: number): string {
  return new Date(unixMs).toLocaleString();
}

export function SystemPanel() {
  const project = useProjectStore((s) => s.project);
  const load = useProjectStore((s) => s.load);

  const [monitoring, setMonitoring] = useState<MonitoringState | null>(null);
  const [autosaveIntervalSecs, setAutosaveIntervalSecs] = useState(60);
  const [snapshots, setSnapshots] = useState<RecoverySnapshot[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!project) return;
    setMonitoring(project.monitoring);
    setAutosaveIntervalSecs(project.autosave_interval_secs);
  }, [project]);

  useEffect(() => {
    let mounted = true;
    api
      .recoverySnapshotList()
      .then((items) => {
        if (mounted) setSnapshots(items);
      })
      .catch(() => {
        if (mounted) setSnapshots([]);
      });
    return () => {
      mounted = false;
    };
  }, [project?.title]);

  if (!project || !monitoring) {
    return <p className="text-xs text-deck-text-muted">No project loaded.</p>;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs uppercase tracking-widest text-deck-cyan">Monitoring / Recovery / System</h3>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Low-Latency Monitoring</p>

        <label className="text-[11px] text-deck-text-muted flex items-center gap-2">
          <input
            type="checkbox"
            checked={monitoring.input_monitoring_enabled}
            onChange={(event) =>
              setMonitoring((prev) =>
                prev
                  ? {
                      ...prev,
                      input_monitoring_enabled: event.target.checked,
                    }
                  : prev
              )
            }
          />
          Input monitoring enabled
        </label>

        <label className="text-[11px] text-deck-text-muted flex items-center gap-2">
          <input
            type="checkbox"
            checked={monitoring.direct_monitoring_preferred}
            onChange={(event) =>
              setMonitoring((prev) =>
                prev
                  ? {
                      ...prev,
                      direct_monitoring_preferred: event.target.checked,
                    }
                  : prev
              )
            }
          />
          Prefer direct hardware monitoring
        </label>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <label className="text-deck-text-muted flex flex-col gap-1">
            Target Buffer (ms)
            <input
              type="number"
              min={8}
              max={2048}
              step={1}
              value={monitoring.target_buffer_ms}
              onChange={(event) =>
                setMonitoring((prev) =>
                  prev
                    ? {
                        ...prev,
                        target_buffer_ms: Math.max(8, Math.min(2048, Number(event.target.value))),
                      }
                    : prev
                )
              }
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            />
          </label>
          <label className="text-deck-text-muted flex flex-col gap-1">
            Latency Compensation (ms)
            <input
              type="number"
              min={0}
              max={200}
              step={0.1}
              value={monitoring.latency_compensation_ms}
              onChange={(event) =>
                setMonitoring((prev) =>
                  prev
                    ? {
                        ...prev,
                        latency_compensation_ms: Math.max(0, Math.min(200, Number(event.target.value))),
                      }
                    : prev
                )
              }
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            />
          </label>
        </div>

        <button
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("monitoring");
            setError(null);
            try {
              await api.monitoringUpdate(monitoring);
              await load();
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(null);
            }
          }}
          className="w-full rounded border border-deck-cyan/40 bg-deck-cyan/10 text-deck-cyan text-[11px] px-2 py-1 disabled:opacity-50"
        >
          Apply Monitoring Settings
        </button>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Autosave</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={10}
            max={3600}
            step={1}
            value={autosaveIntervalSecs}
            onChange={(event) => setAutosaveIntervalSecs(Number(event.target.value))}
            className="w-24 rounded border border-deck-border bg-deck-surface px-2 py-1 text-[11px]"
          />
          <span className="text-[11px] text-deck-text-muted">seconds</span>
          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              setBusy("autosave");
              setError(null);
              try {
                await api.autosaveIntervalSet(Math.max(10, Math.min(3600, autosaveIntervalSecs)));
                await load();
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(null);
              }
            }}
            className="ml-auto px-2 py-1 rounded text-[11px] border border-deck-border bg-deck-muted disabled:opacity-50"
          >
            Save Interval
          </button>
        </div>
        <p className="text-[10px] text-deck-text-muted/80">
          Autosave snapshots are captured in the background using this interval.
        </p>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Recovery Snapshots</p>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                setBusy("snapshot_save");
                setError(null);
                try {
                  await api.recoverySnapshotSave("manual");
                  const listed = await api.recoverySnapshotList();
                  setSnapshots(listed);
                  await load();
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(null);
                }
              }}
              className="px-2 py-1 rounded text-[11px] border border-deck-cyan/40 bg-deck-cyan/10 text-deck-cyan disabled:opacity-50"
            >
              Save Snapshot
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                setBusy("snapshot_refresh");
                setError(null);
                try {
                  const listed = await api.recoverySnapshotList();
                  setSnapshots(listed);
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(null);
                }
              }}
              className="px-2 py-1 rounded text-[11px] border border-deck-border bg-deck-muted disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="space-y-1 max-h-44 overflow-auto">
          {snapshots.length === 0 && <p className="text-[11px] text-deck-text-muted">No snapshots found.</p>}
          {snapshots.map((snapshot) => (
            <div key={snapshot.id} className="rounded border border-deck-border p-1.5 text-[10px]">
              <div className="flex items-center justify-between">
                <span className="text-deck-text-muted">{snapshot.reason}</span>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy("snapshot_restore");
                    setError(null);
                    try {
                      await api.recoverySnapshotRestore(snapshot.path);
                      await load();
                    } catch (e) {
                      setError(String(e));
                    } finally {
                      setBusy(null);
                    }
                  }}
                  className="px-1.5 py-0.5 rounded border border-deck-magenta/40 text-deck-magenta disabled:opacity-50"
                >
                  Restore
                </button>
              </div>
              <div className="text-deck-text-muted/80">{snapshotTime(snapshot.created_unix_ms)}</div>
              <div className="truncate text-deck-cyan" title={snapshot.path}>
                {snapshot.path}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-[11px] text-red-300">{error}</p>}
    </div>
  );
}
