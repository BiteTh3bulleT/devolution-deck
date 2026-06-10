import { useState } from "react";
import { useProjectStore } from "../stores/projectStore";
import { useSessionStore } from "../stores/sessionStore";
import { usePerformanceStore } from "../stores/performanceStore";

export function PerformanceModeView() {
  const project = useProjectStore((s) => s.project);
  const launchScene = useSessionStore((s) => s.launchScene);
  const triggerMacro = usePerformanceStore((s) => s.triggerMacro);

  const [error, setError] = useState<string | null>(null);

  if (!project) {
    return <div className="flex-1 bg-deck-surface p-4 text-sm text-deck-text-muted">No project loaded.</div>;
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-[radial-gradient(circle_at_20%_0%,rgba(255,107,26,0.16),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(56,215,255,0.12),transparent_45%)] p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="rounded border border-deck-border bg-deck-panel/80 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-deck-cyan">Performance Mode</p>
              <p className="text-sm text-deck-text-muted">
                Quantize {project.performance_mode.launch_quantize_beats} beats ·
                {" "}
                Safety {project.performance_mode.safety_lock ? "ON" : "OFF"}
              </p>
            </div>
            <div className="text-xs text-deck-text-muted">
              Active Macro: {project.performance_mode.active_macro_id ?? "none"}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded border border-deck-border bg-deck-panel/80 p-3 space-y-2">
            <p className="text-xs uppercase tracking-wide text-deck-text-muted">Scene Launch Grid</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {project.session.scenes.map((scene) => (
                <button
                  key={scene.id}
                  type="button"
                  onClick={async () => {
                    setError(null);
                    try {
                      await launchScene(scene.id);
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                  className="rounded border border-deck-border bg-deck-surface p-3 text-left hover:border-deck-cyan/40"
                  style={{ boxShadow: `inset 0 0 0 1px ${scene.color}22` }}
                >
                  <div className="text-sm text-deck-text">{scene.name}</div>
                  <div className="text-[10px] text-deck-text-muted">Q {scene.launch_quantize_beats}</div>
                </button>
              ))}
              {project.session.scenes.length === 0 && (
                <p className="text-[11px] text-deck-text-muted">No scenes configured.</p>
              )}
            </div>
          </div>

          <div className="rounded border border-deck-border bg-deck-panel/80 p-3 space-y-2">
            <p className="text-xs uppercase tracking-wide text-deck-text-muted">Macro Pads</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {project.performance_macros.map((macro) => (
                <button
                  key={macro.id}
                  type="button"
                  disabled={!macro.enabled}
                  onClick={async () => {
                    setError(null);
                    try {
                      await triggerMacro(macro.id);
                      if (macro.launch_scene_id) {
                        await launchScene(macro.launch_scene_id);
                      }
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                  className="rounded border border-deck-border p-3 text-left disabled:opacity-40"
                  style={{ background: `${macro.color}22`, borderColor: `${macro.color}55` }}
                >
                  <div className="text-sm text-deck-text">{macro.name}</div>
                  <div className="text-[10px] text-deck-text-muted">{macro.description}</div>
                </button>
              ))}
              {project.performance_macros.length === 0 && (
                <p className="text-[11px] text-deck-text-muted">No macros configured.</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded border border-deck-border bg-deck-panel/80 p-3">
          <p className="text-xs uppercase tracking-wide text-deck-text-muted mb-2">Visual / Lighting State</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
            <div className="rounded border border-deck-border bg-deck-surface p-2">
              <div className="text-deck-text-muted">Visual Sync</div>
              <div className="text-deck-text">{project.visual_sync.enabled ? "ON" : "OFF"}</div>
            </div>
            <div className="rounded border border-deck-border bg-deck-surface p-2">
              <div className="text-deck-text-muted">BPM Mult</div>
              <div className="text-deck-text">{project.visual_sync.bpm_multiplier.toFixed(2)}</div>
            </div>
            <div className="rounded border border-deck-border bg-deck-surface p-2">
              <div className="text-deck-text-muted">Show Cues</div>
              <div className="text-deck-text">{project.show_cues.length}</div>
            </div>
            <div className="rounded border border-deck-border bg-deck-surface p-2">
              <div className="text-deck-text-muted">Cue Bindings</div>
              <div className="text-deck-text">{project.lighting_cue_bindings.length}</div>
            </div>
          </div>
        </div>

        {error && <p className="text-[11px] text-red-300">{error}</p>}
      </div>
    </div>
  );
}
