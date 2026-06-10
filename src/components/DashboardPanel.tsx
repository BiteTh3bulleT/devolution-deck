import { useEffect, useMemo, useState } from "react";
import * as api from "../api";
import type { ProducerInsight } from "../types";
import { useProjectStore } from "../stores/projectStore";
import { useViewStore } from "../stores/viewStore";

function severityClass(severity: string): string {
  switch (severity) {
    case "high":
      return "text-red-300";
    case "medium":
      return "text-deck-amber";
    default:
      return "text-deck-cyan";
  }
}

export function DashboardPanel() {
  const project = useProjectStore((s) => s.project);
  const load = useProjectStore((s) => s.load);
  const setUtilityTab = useViewStore((s) => s.setUtilityTab);
  const setMainView = useViewStore((s) => s.setMainView);

  const [insights, setInsights] = useState<ProducerInsight[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (!project) {
      return {
        tracks: 0,
        clips: 0,
        pluginInstances: 0,
        scenes: 0,
      };
    }
    return {
      tracks: project.tracks.length,
      clips: project.tracks.reduce((acc, track) => acc + track.clips.length + track.midi_clips.length, 0),
      pluginInstances: project.tracks.reduce((acc, track) => acc + track.plugin_chain.instances.length, 0),
      scenes: project.session.scenes.length,
    };
  }, [project]);

  useEffect(() => {
    let mounted = true;
    setBusy(true);
    api
      .dashboardInsightsGenerate()
      .then((generated) => {
        if (mounted) {
          setInsights(generated);
        }
      })
      .catch((e) => {
        if (mounted) {
          setError(String(e));
        }
      })
      .finally(() => {
        if (mounted) {
          setBusy(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [project?.title, project?.tracks.length]);

  if (!project) {
    return <p className="text-xs text-deck-text-muted">No project loaded.</p>;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs uppercase tracking-widest text-deck-cyan">Producer Dashboard</h3>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border border-deck-border bg-deck-panel p-2 text-[11px]">
          <div className="text-deck-text-muted">Tracks</div>
          <div className="text-xl text-deck-text tabular-nums">{stats.tracks}</div>
        </div>
        <div className="rounded border border-deck-border bg-deck-panel p-2 text-[11px]">
          <div className="text-deck-text-muted">Clips</div>
          <div className="text-xl text-deck-text tabular-nums">{stats.clips}</div>
        </div>
        <div className="rounded border border-deck-border bg-deck-panel p-2 text-[11px]">
          <div className="text-deck-text-muted">Plugins</div>
          <div className="text-xl text-deck-text tabular-nums">{stats.pluginInstances}</div>
        </div>
        <div className="rounded border border-deck-border bg-deck-panel p-2 text-[11px]">
          <div className="text-deck-text-muted">Scenes</div>
          <div className="text-xl text-deck-text tabular-nums">{stats.scenes}</div>
        </div>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Quick Actions</p>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => {
              setUtilityTab("assistant");
            }}
            className="px-2 py-1 rounded border border-deck-border bg-deck-surface text-[11px]"
          >
            Open Assistant
          </button>
          <button
            type="button"
            onClick={() => {
              setUtilityTab("render");
            }}
            className="px-2 py-1 rounded border border-deck-border bg-deck-surface text-[11px]"
          >
            Render & Freeze
          </button>
          <button
            type="button"
            onClick={() => {
              setMainView("session");
              setUtilityTab("performance");
            }}
            className="px-2 py-1 rounded border border-deck-border bg-deck-surface text-[11px]"
          >
            Stage Prep
          </button>
          <button
            type="button"
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api.assistantAssetClassify(true);
                await load();
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
            className="px-2 py-1 rounded border border-deck-border bg-deck-surface text-[11px]"
          >
            Auto-Tag Assets
          </button>
        </div>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Insights</p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const generated = await api.dashboardInsightsGenerate();
                setInsights(generated);
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
            className="px-2 py-0.5 rounded border border-deck-border bg-deck-surface text-[10px] disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        <div className="space-y-1 max-h-52 overflow-auto">
          {insights.length === 0 && <p className="text-[11px] text-deck-text-muted">No critical insights right now.</p>}
          {insights.map((insight) => (
            <div key={insight.id} className="rounded border border-deck-border p-1.5 text-[10px]">
              <div className="flex items-center justify-between">
                <span className="text-deck-text">{insight.title}</span>
                <span className={severityClass(insight.severity)}>{insight.severity}</span>
              </div>
              <div className="text-deck-text-muted">{insight.description}</div>
              <div className="text-deck-cyan">Action: {insight.action_id}</div>
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-[11px] text-red-300">{error}</p>}
    </div>
  );
}
