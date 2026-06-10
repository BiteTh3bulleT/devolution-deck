import { useEffect, useMemo, useState } from "react";
import * as api from "../api";
import type {
  CompatibilityReport,
  DeviceDiagnosticState,
  ErrorReport,
  MediaRelinkResult,
  MigrationPlan,
  MissingMediaAsset,
  NavigationState,
  OnboardingState,
  PerformanceProfile,
  PluginChainIssue,
  ReleaseConfig,
  ReleaseReadinessCheck,
  SystemHealthSnapshot,
  UserPreferences,
} from "../types";
import { useProjectStore } from "../stores/projectStore";

function formatTimestamp(unixMs?: number): string {
  if (!unixMs) return "-";
  return new Date(unixMs).toLocaleString();
}

function defaultSupportPath(projectTitle: string | undefined): string {
  const safe = (projectTitle ?? "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `/tmp/${safe || "devolution"}_support_${stamp}.json`;
}

function defaultMigrationBackupPath(projectPath: string | null, projectTitle: string | undefined): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (projectPath) {
    const cleaned = projectPath.replace(/\\/g, "/");
    const root = cleaned.split("/").slice(0, -1).join("/");
    return `${root}/${(projectTitle ?? "devolution").replace(/\s+/g, "_")}.migration-backup-${stamp}.json`;
  }
  return `/tmp/${(projectTitle ?? "devolution").replace(/\s+/g, "_")}.migration-backup-${stamp}.json`;
}

export function ReleaseOpsPanel() {
  const project = useProjectStore((state) => state.project);
  const projectPath = useProjectStore((state) => state.projectPath);
  const load = useProjectStore((state) => state.load);

  const [navigation, setNavigation] = useState<NavigationState | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [releaseConfig, setReleaseConfig] = useState<ReleaseConfig | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);

  const [diagnostics, setDiagnostics] = useState<DeviceDiagnosticState | null>(null);
  const [compatibility, setCompatibility] = useState<CompatibilityReport | null>(null);
  const [migrationPlan, setMigrationPlan] = useState<MigrationPlan | null>(null);
  const [migrationBackupPath, setMigrationBackupPath] = useState("");
  const [readinessCheck, setReadinessCheck] = useState<ReleaseReadinessCheck | null>(null);
  const [missingAssets, setMissingAssets] = useState<MissingMediaAsset[]>([]);
  const [relinkResults, setRelinkResults] = useState<MediaRelinkResult[]>([]);
  const [health, setHealth] = useState<SystemHealthSnapshot | null>(null);
  const [profile, setProfile] = useState<PerformanceProfile | null>(null);
  const [pluginIssues, setPluginIssues] = useState<PluginChainIssue[]>([]);
  const [errorReports, setErrorReports] = useState<ErrorReport[]>([]);

  const [supportPath, setSupportPath] = useState("");
  const [relinkRoots, setRelinkRoots] = useState("");
  const [includeProjectState, setIncludeProjectState] = useState(false);
  const [includeDeviceState, setIncludeDeviceState] = useState(true);
  const [includeLogs, setIncludeLogs] = useState(true);

  const [newErrorSource, setNewErrorSource] = useState("ops_panel");
  const [newErrorMessage, setNewErrorMessage] = useState("");

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!project) return;
    setNavigation(project.navigation);
    setPreferences(project.preferences);
    setReleaseConfig(project.release_config);
    setOnboarding(project.onboarding);
    setDiagnostics(project.device_diagnostics);
    setHealth(project.system_health);
    setProfile(project.performance_profile);
    setErrorReports(project.error_reports);
    setSupportPath(defaultSupportPath(project.title));
    setMigrationBackupPath(defaultMigrationBackupPath(projectPath, project.title));
    const defaultRoots = [
      projectPath ? projectPath.replace(/\\/g, "/").split("/").slice(0, -1).join("/") : "",
      "/home",
      "/mnt",
      "/media",
    ].filter(Boolean);
    setRelinkRoots(Array.from(new Set(defaultRoots)).join(","));
  }, [project, projectPath]);

  const compatibilitySummary = useMemo(() => {
    if (!compatibility) return "No compatibility report generated in this session.";
    if (compatibility.compatible) {
      return `Compatible with schema v${compatibility.schema_version}.`;
    }
    return `Requires action (${compatibility.required_migrations.length} migrations, ${compatibility.missing_assets.length} missing assets).`;
  }, [compatibility]);

  if (!project || !navigation || !preferences || !releaseConfig || !onboarding) {
    return <p className="text-xs text-deck-text-muted">No project loaded.</p>;
  }

  const runTask = async (id: string, task: () => Promise<void>) => {
    setBusy(id);
    setError(null);
    setStatus(null);
    try {
      await task();
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : String(taskError));
    } finally {
      setBusy(null);
    }
  };

  const refreshErrorReports = async () => {
    try {
      const reports = await api.errorReportList();
      setErrorReports(reports);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs uppercase tracking-widest text-deck-cyan">Release Candidate Ops</h3>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Unified App Flow</p>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <label className="text-deck-text-muted flex flex-col gap-1">
            App Mode
            <select
              value={navigation.active_mode}
              onChange={(event) =>
                setNavigation((prev) =>
                  prev
                    ? {
                        ...prev,
                        active_mode: event.target.value as NavigationState["active_mode"],
                      }
                    : prev
                )
              }
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            >
              <option value="studio">Studio</option>
              <option value="deck">Deck</option>
              <option value="show">Show</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </label>
          <label className="text-deck-text-muted flex flex-col gap-1">
            Main View
            <select
              value={navigation.main_view}
              onChange={(event) =>
                setNavigation((prev) =>
                  prev
                    ? {
                        ...prev,
                        main_view: event.target.value,
                      }
                    : prev
                )
              }
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            >
              <option value="arrangement">Arrangement</option>
              <option value="session">Session</option>
              <option value="decks">Decks</option>
              <option value="performance">Performance</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            void runTask("nav_update", async () => {
              await api.navigationUpdate(navigation);
              await load();
              setStatus("Navigation state updated.");
            })
          }
          className="w-full rounded border border-deck-cyan/40 bg-deck-cyan/10 text-deck-cyan text-[11px] px-2 py-1 disabled:opacity-50"
        >
          Apply App Flow
        </button>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Preferences</p>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <label className="text-deck-text-muted flex items-center gap-1">
            <input
              type="checkbox"
              checked={preferences.open_last_project_on_launch}
              onChange={(event) =>
                setPreferences((prev) =>
                  prev
                    ? {
                        ...prev,
                        open_last_project_on_launch: event.target.checked,
                      }
                    : prev
                )
              }
            />
            Open last project
          </label>
          <label className="text-deck-text-muted flex items-center gap-1">
            <input
              type="checkbox"
              checked={preferences.auto_analyze_library}
              onChange={(event) =>
                setPreferences((prev) =>
                  prev
                    ? {
                        ...prev,
                        auto_analyze_library: event.target.checked,
                      }
                    : prev
                )
              }
            />
            Auto analyze library
          </label>
          <label className="text-deck-text-muted flex items-center gap-1">
            <input
              type="checkbox"
              checked={preferences.low_light_boost}
              onChange={(event) =>
                setPreferences((prev) =>
                  prev
                    ? {
                        ...prev,
                        low_light_boost: event.target.checked,
                      }
                    : prev
                )
              }
            />
            Low-light boost
          </label>
          <label className="text-deck-text-muted flex items-center gap-1">
            <input
              type="checkbox"
              checked={preferences.reduce_motion}
              onChange={(event) =>
                setPreferences((prev) =>
                  prev
                    ? {
                        ...prev,
                        reduce_motion: event.target.checked,
                      }
                    : prev
                )
              }
            />
            Reduce motion
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <label className="text-deck-text-muted flex flex-col gap-1">
            Startup Mode
            <select
              value={preferences.startup_mode}
              onChange={(event) =>
                setPreferences((prev) =>
                  prev
                    ? {
                        ...prev,
                        startup_mode: event.target.value as UserPreferences["startup_mode"],
                      }
                    : prev
                )
              }
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            >
              <option value="studio">Studio</option>
              <option value="deck">Deck</option>
              <option value="show">Show</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </label>
          <label className="text-deck-text-muted flex flex-col gap-1">
            UI Scale
            <input
              type="number"
              min={0.8}
              max={1.5}
              step={0.05}
              value={preferences.ui_scale}
              onChange={(event) =>
                setPreferences((prev) =>
                  prev
                    ? {
                        ...prev,
                        ui_scale: Number(event.target.value),
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
          onClick={() =>
            void runTask("prefs_update", async () => {
              await api.preferencesUpdate(preferences);
              await load();
              setStatus("Preferences saved.");
            })
          }
          className="w-full rounded border border-deck-border bg-deck-muted text-[11px] px-2 py-1 disabled:opacity-50"
        >
          Save Preferences
        </button>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Device Management and Diagnostics</p>
        <div className="flex items-center gap-2 text-[10px] text-deck-text-muted">
          <span>Profiles: {project.device_profiles.length}</span>
          <span>MIDI: {project.device_diagnostics.midi_binding_count}</span>
          <span>OSC: {project.device_diagnostics.osc_binding_count}</span>
          <span>DMX: {project.device_diagnostics.dmx_universe_count}</span>
          <span className={project.device_diagnostics.healthy ? "text-deck-cyan" : "text-deck-amber"}>
            {project.device_diagnostics.healthy ? "Healthy" : "Attention"}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void runTask("profiles_refresh", async () => {
                await api.deviceProfilesRefresh();
                await load();
                setStatus("Device profiles refreshed.");
              })
            }
            className="px-2 py-1 rounded text-[11px] border border-deck-border bg-deck-muted disabled:opacity-50"
          >
            Refresh Profiles
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void runTask("diag_run", async () => {
                const state = await api.deviceDiagnosticsRun();
                setDiagnostics(state);
                await load();
                setStatus("Diagnostics run completed.");
              })
            }
            className="px-2 py-1 rounded text-[11px] border border-deck-cyan/40 text-deck-cyan disabled:opacity-50"
          >
            Run Diagnostics
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void runTask("plugin_preflight", async () => {
                const issues = await api.pluginChainPreflight();
                setPluginIssues(issues);
                setStatus(
                  issues.length === 0
                    ? "Plugin chain preflight passed."
                    : `Plugin preflight found ${issues.length} issue(s).`
                );
              })
            }
            className="px-2 py-1 rounded text-[11px] border border-deck-amber/40 text-deck-amber disabled:opacity-50"
          >
            Plugin Preflight
          </button>
        </div>
        {diagnostics && (
          <div className="text-[10px] text-deck-text-muted space-y-1">
            <p>Last Run: {formatTimestamp(diagnostics.last_run_unix_ms)}</p>
            {diagnostics.warnings.length > 0 && <p>Warnings: {diagnostics.warnings.join(" | ")}</p>}
            {diagnostics.errors.length > 0 && <p className="text-red-300">Errors: {diagnostics.errors.join(" | ")}</p>}
          </div>
        )}
        {pluginIssues.length > 0 && (
          <div className="text-[10px] space-y-1 max-h-24 overflow-auto">
            {pluginIssues.slice(0, 20).map((issue) => (
              <p
                key={`${issue.track_id}-${issue.instance_id}-${issue.message}`}
                className={issue.severity === "error" ? "text-red-300" : "text-deck-amber"}
              >
                {issue.track_name}: {issue.message}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Migration and Compatibility</p>
        <p className="text-[10px] text-deck-text-muted">{compatibilitySummary}</p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void runTask("compat", async () => {
                const report = await api.compatibilityReportGenerate();
                setCompatibility(report);
                await load();
              })
            }
            className="px-2 py-1 rounded text-[11px] border border-deck-border bg-deck-muted disabled:opacity-50"
          >
            Generate Report
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void runTask("plan", async () => {
                const plan = await api.migrationPlanGenerate();
                setMigrationPlan(plan);
                await load();
              })
            }
            className="px-2 py-1 rounded text-[11px] border border-deck-border bg-deck-muted disabled:opacity-50"
          >
            Create Plan
          </button>
          <button
            type="button"
            disabled={busy !== null || !migrationPlan}
            onClick={() =>
              void runTask("apply", async () => {
                if (!migrationPlan) return;
                const applied = await api.migrationPlanApply(
                  migrationPlan.id,
                  migrationBackupPath.trim().length > 0 ? migrationBackupPath : undefined
                );
                setMigrationPlan(applied);
                await load();
                setStatus("Migration plan applied.");
              })
            }
            className="px-2 py-1 rounded text-[11px] border border-deck-cyan/40 text-deck-cyan disabled:opacity-50"
          >
            Apply Plan
          </button>
        </div>
        <input
          value={migrationBackupPath}
          onChange={(event) => setMigrationBackupPath(event.target.value)}
          className="w-full rounded border border-deck-border bg-deck-surface px-2 py-1 text-[11px]"
          placeholder="/tmp/devolution.migration-backup.json"
        />
        {migrationPlan && (
          <div className="text-[10px] text-deck-text-muted space-y-1">
            <p>
              Plan {migrationPlan.source_version} → {migrationPlan.target_version} · {migrationPlan.applied ? "Applied" : "Pending"}
            </p>
            {migrationPlan.steps.map((step) => (
              <p key={step.id}>
                {step.applied ? "✓" : "•"} {step.description}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Missing Asset Relink</p>
        <p className="text-[10px] text-deck-text-muted">
          Missing assets: {missingAssets.length}. Search roots are comma-separated absolute directories.
        </p>
        <input
          value={relinkRoots}
          onChange={(event) => setRelinkRoots(event.target.value)}
          className="w-full rounded border border-deck-border bg-deck-surface px-2 py-1 text-[11px]"
          placeholder="/home,/mnt,/media"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void runTask("relink_scan", async () => {
                const missing = await api.projectMissingMediaScan();
                setMissingAssets(missing);
                setStatus(`Found ${missing.length} missing assets.`);
              })
            }
            className="px-2 py-1 rounded text-[11px] border border-deck-border bg-deck-muted disabled:opacity-50"
          >
            Scan Missing
          </button>
          <button
            type="button"
            disabled={busy !== null || relinkRoots.trim().length === 0}
            onClick={() =>
              void runTask("relink_dry", async () => {
                const roots = relinkRoots
                  .split(",")
                  .map((entry) => entry.trim())
                  .filter(Boolean);
                const results = await api.projectMissingMediaRelink(roots, true);
                setRelinkResults(results);
                const matched = results.filter((result) => result.relinked).length;
                setStatus(`Dry run matched ${matched}/${results.length} missing assets.`);
              })
            }
            className="px-2 py-1 rounded text-[11px] border border-deck-border bg-deck-muted disabled:opacity-50"
          >
            Dry Run
          </button>
          <button
            type="button"
            disabled={busy !== null || relinkRoots.trim().length === 0}
            onClick={() =>
              void runTask("relink_apply", async () => {
                const roots = relinkRoots
                  .split(",")
                  .map((entry) => entry.trim())
                  .filter(Boolean);
                const results = await api.projectMissingMediaRelink(roots, false);
                setRelinkResults(results);
                const matched = results.filter((result) => result.relinked).length;
                await load();
                const refreshedMissing = await api.projectMissingMediaScan();
                setMissingAssets(refreshedMissing);
                setStatus(`Applied relink for ${matched} assets. Remaining missing: ${refreshedMissing.length}.`);
              })
            }
            className="px-2 py-1 rounded text-[11px] border border-deck-cyan/40 text-deck-cyan disabled:opacity-50"
          >
            Apply Relink
          </button>
        </div>
        {missingAssets.length > 0 && (
          <div className="max-h-24 overflow-auto space-y-1 text-[10px] text-deck-text-muted">
            {missingAssets.slice(0, 20).map((asset) => (
              <p key={asset.asset_id} className="truncate" title={asset.path}>
                {asset.filename}
              </p>
            ))}
            {missingAssets.length > 20 && <p>+{missingAssets.length - 20} more…</p>}
          </div>
        )}
        {relinkResults.length > 0 && (
          <div className="max-h-28 overflow-auto space-y-1 text-[10px] text-deck-text-muted">
            {relinkResults.slice(0, 30).map((result) => (
              <p key={`${result.asset_id}-${result.old_path}`} className="truncate" title={result.old_path}>
                {result.relinked ? "✓" : "•"} {result.old_path.split(/[\\/]/).pop() ?? result.old_path}
                {result.relinked && result.new_path ? ` → ${result.new_path}` : ""}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Performance and System Health</p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void runTask("profile", async () => {
                const captured = await api.performanceProfileCapture();
                setProfile(captured);
                await load();
              })
            }
            className="px-2 py-1 rounded text-[11px] border border-deck-border bg-deck-muted disabled:opacity-50"
          >
            Capture Profile
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void runTask("health", async () => {
                const snapshot = await api.systemHealthSnapshot();
                setHealth(snapshot);
                await load();
              })
            }
            className="px-2 py-1 rounded text-[11px] border border-deck-border bg-deck-muted disabled:opacity-50"
          >
            Refresh Health
          </button>
        </div>
        {profile && (
          <div className="text-[10px] text-deck-text-muted space-y-1">
            <p>Tracks {profile.project_track_count} · Clips {profile.project_clip_count} · Buffer {profile.audio_buffer_ms} ms</p>
            <p>{profile.recommendation}</p>
          </div>
        )}
        {health && (
          <div className="text-[10px] text-deck-text-muted space-y-1">
            <p>
              Health {Math.round(health.device_health_score * 100)}% · Pending Errors {health.pending_errors} · Warnings {health.recent_warning_count}
            </p>
            <div className="flex gap-1 flex-wrap">
              {health.status_indicators.map((indicator) => (
                <span
                  key={indicator.id}
                  className={[
                    "px-1.5 py-0.5 rounded border text-[9px]",
                    indicator.level === "ok"
                      ? "border-deck-cyan/40 text-deck-cyan"
                      : indicator.level === "warn"
                        ? "border-deck-amber/40 text-deck-amber"
                        : "border-red-400/50 text-red-300",
                  ].join(" ")}
                  title={indicator.detail}
                >
                  {indicator.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Release Readiness</p>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            void runTask("release_readiness", async () => {
              const check = await api.releaseReadinessCheck();
              setReadinessCheck(check);
              setStatus(check.ready ? "Release readiness check passed." : "Release readiness check found blockers.");
            })
          }
          className="px-2 py-1 rounded text-[11px] border border-deck-cyan/40 text-deck-cyan disabled:opacity-50"
        >
          Run Readiness Check
        </button>
        {readinessCheck && (
          <div className="text-[10px] space-y-1">
            <p className={readinessCheck.ready ? "text-deck-cyan" : "text-deck-amber"}>
              {readinessCheck.ready ? "Ready" : "Blocked"} · {formatTimestamp(readinessCheck.created_unix_ms)}
            </p>
            {readinessCheck.blockers.map((item, index) => (
              <p key={`block-${index}-${item}`} className="text-red-300">Blocker: {item}</p>
            ))}
            {readinessCheck.warnings.map((item, index) => (
              <p key={`warn-${index}-${item}`} className="text-deck-amber">Warning: {item}</p>
            ))}
          </div>
        )}
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Error Handling and Recovery</p>
        <div className="grid grid-cols-[120px_1fr_80px] gap-1">
          <input
            value={newErrorSource}
            onChange={(event) => setNewErrorSource(event.target.value)}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1 text-[11px]"
            placeholder="source"
          />
          <input
            value={newErrorMessage}
            onChange={(event) => setNewErrorMessage(event.target.value)}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1 text-[11px]"
            placeholder="record actionable error"
          />
          <button
            type="button"
            disabled={busy !== null || newErrorMessage.trim().length === 0}
            onClick={() =>
              void runTask("err_add", async () => {
                await api.errorReportAdd({ source: newErrorSource, message: newErrorMessage, severity: "warn" });
                setNewErrorMessage("");
                await refreshErrorReports();
                await load();
              })
            }
            className="px-2 py-1 rounded text-[11px] border border-deck-border bg-deck-muted disabled:opacity-50"
          >
            Add
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void runTask("err_refresh", async () => {
                await refreshErrorReports();
              })
            }
            className="px-2 py-1 rounded text-[11px] border border-deck-border bg-deck-muted disabled:opacity-50"
          >
            Refresh Errors
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void runTask("err_dispatch_pending", async () => {
                const dispatched = await api.errorReportDispatch();
                await refreshErrorReports();
                await load();
                setStatus(`Dispatched ${dispatched.length} error report(s).`);
              })
            }
            className="px-2 py-1 rounded text-[11px] border border-deck-magenta/40 text-deck-magenta disabled:opacity-50"
          >
            Dispatch Pending
          </button>
        </div>
        <div className="max-h-36 overflow-auto space-y-1">
          {errorReports.length === 0 && <p className="text-[10px] text-deck-text-muted">No reports captured.</p>}
          {errorReports
            .slice()
            .reverse()
            .map((report) => (
              <div key={report.id} className="rounded border border-deck-border p-1.5 text-[10px] space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-deck-text-muted">{report.source}</span>
                  <span className={report.acknowledged ? "text-deck-cyan" : "text-deck-amber"}>
                    {report.acknowledged ? "acknowledged" : "pending"}
                  </span>
                </div>
                <p className="text-deck-text">{report.message}</p>
                <p className="text-deck-text-muted/80">{formatTimestamp(report.created_unix_ms)}</p>
                <p className="text-deck-text-muted/80">
                  Dispatch attempts {report.dispatch_attempts}
                  {report.dispatched_unix_ms ? ` · Last sent ${formatTimestamp(report.dispatched_unix_ms)}` : ""}
                </p>
                <div className="flex items-center gap-2">
                  {!report.acknowledged && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        void runTask(`ack-${report.id}`, async () => {
                          await api.errorReportAck(report.id, true);
                          await refreshErrorReports();
                          await load();
                        })
                      }
                      className="px-1.5 py-0.5 rounded border border-deck-cyan/40 text-deck-cyan"
                    >
                      Mark Acknowledged
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void runTask(`dispatch-${report.id}`, async () => {
                        await api.errorReportDispatch(report.id);
                        await refreshErrorReports();
                        await load();
                      })
                    }
                    className="px-1.5 py-0.5 rounded border border-deck-magenta/40 text-deck-magenta"
                  >
                    Dispatch
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Support Bundle Export</p>
        <input
          value={supportPath}
          onChange={(event) => setSupportPath(event.target.value)}
          className="w-full rounded border border-deck-border bg-deck-surface px-2 py-1 text-[11px]"
          placeholder="/tmp/devolution_support.json"
        />
        <div className="flex gap-3 text-[11px] text-deck-text-muted">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={includeProjectState} onChange={(event) => setIncludeProjectState(event.target.checked)} />
            Project State
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={includeDeviceState} onChange={(event) => setIncludeDeviceState(event.target.checked)} />
            Device State
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={includeLogs} onChange={(event) => setIncludeLogs(event.target.checked)} />
            Logs
          </label>
        </div>
        <label className="text-[11px] text-deck-text-muted flex flex-col gap-1">
          Crash Report Endpoint
          <input
            value={releaseConfig.crash_report_endpoint ?? ""}
            onChange={(event) =>
              setReleaseConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      crash_report_endpoint: event.target.value.trim() || undefined,
                    }
                  : prev
              )
            }
            className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            placeholder="https://example.com/crash-report"
          />
        </label>
        <button
          type="button"
          disabled={busy !== null || supportPath.trim().length === 0}
          onClick={() =>
            void runTask("support_export", async () => {
              const bundle = await api.supportBundleExport({
                path: supportPath,
                includeProjectState,
                includeDeviceState,
                includeLogs,
              });
              await load();
              setStatus(`Support bundle exported: ${bundle.path}`);
            })
          }
          className="w-full rounded border border-deck-magenta/40 bg-deck-magenta/10 text-deck-magenta text-[11px] px-2 py-1 disabled:opacity-50"
        >
          Export Support Bundle
        </button>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Onboarding and Help</p>
        <div className="space-y-1 text-[11px]">
          {onboarding.steps.map((step, index) => (
            <label key={step.id} className="flex items-center gap-2 text-deck-text-muted">
              <input
                type="checkbox"
                checked={step.completed}
                onChange={(event) =>
                  setOnboarding((prev) => {
                    if (!prev) return prev;
                    const nextSteps = [...prev.steps];
                    nextSteps[index] = {
                      ...nextSteps[index],
                      completed: event.target.checked,
                    };
                    return {
                      ...prev,
                      steps: nextSteps,
                      current_step_index: event.target.checked
                        ? Math.min(prev.current_step_index + 1, nextSteps.length - 1)
                        : prev.current_step_index,
                    };
                  })
                }
              />
              {step.title}
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            void runTask("onboarding", async () => {
              await api.onboardingStateUpdate(onboarding);
              await load();
              setStatus("Onboarding state updated.");
            })
          }
          className="w-full rounded border border-deck-border bg-deck-muted text-[11px] px-2 py-1 disabled:opacity-50"
        >
          Save Onboarding Progress
        </button>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Release Configuration</p>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <label className="text-deck-text-muted flex flex-col gap-1">
            Channel
            <input
              value={releaseConfig.channel}
              onChange={(event) =>
                setReleaseConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        channel: event.target.value,
                      }
                    : prev
                )
              }
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            />
          </label>
          <label className="text-deck-text-muted flex flex-col gap-1">
            Build Number
            <input
              type="number"
              min={1}
              step={1}
              value={releaseConfig.build_number}
              onChange={(event) =>
                setReleaseConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        build_number: Math.max(1, Number(event.target.value)),
                      }
                    : prev
                )
              }
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            />
          </label>
        </div>
        <label className="text-[11px] text-deck-text-muted flex flex-col gap-1">
          Target Platforms (comma separated)
          <input
            value={releaseConfig.target_platforms.join(",")}
            onChange={(event) =>
              setReleaseConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      target_platforms: event.target.value
                        .split(",")
                        .map((entry) => entry.trim())
                        .filter(Boolean),
                    }
                  : prev
              )
            }
            className="rounded border border-deck-border bg-deck-surface px-2 py-1"
          />
        </label>
        <div className="flex gap-3 text-[11px] text-deck-text-muted">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={releaseConfig.code_signing_ready}
              onChange={(event) =>
                setReleaseConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        code_signing_ready: event.target.checked,
                      }
                    : prev
                )
              }
            />
            Code signing ready
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={releaseConfig.crash_reporting_enabled}
              onChange={(event) =>
                setReleaseConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        crash_reporting_enabled: event.target.checked,
                      }
                    : prev
                )
              }
            />
            Crash reporting enabled
          </label>
        </div>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            void runTask("release", async () => {
              await api.releaseConfigUpdate(releaseConfig);
              await load();
              setStatus("Release configuration updated.");
            })
          }
          className="w-full rounded border border-deck-cyan/40 bg-deck-cyan/10 text-deck-cyan text-[11px] px-2 py-1 disabled:opacity-50"
        >
          Save Release Config
        </button>
      </div>

      {status && <p className="text-[11px] text-deck-cyan">{status}</p>}
      {error && <p className="text-[11px] text-red-300">{error}</p>}
    </div>
  );
}
