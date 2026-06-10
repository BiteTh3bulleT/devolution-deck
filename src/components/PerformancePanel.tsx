import { useMemo, useState } from "react";
import { v4 } from "../utils/uuid";
import { useProjectStore } from "../stores/projectStore";
import { usePerformanceStore } from "../stores/performanceStore";
import { useSessionStore } from "../stores/sessionStore";

export function PerformancePanel() {
  const project = useProjectStore((s) => s.project);
  const updateMode = usePerformanceStore((s) => s.updateMode);
  const upsertMacro = usePerformanceStore((s) => s.upsertMacro);
  const removeMacro = usePerformanceStore((s) => s.removeMacro);
  const triggerMacro = usePerformanceStore((s) => s.triggerMacro);
  const upsertSceneTrigger = usePerformanceStore((s) => s.upsertSceneTrigger);
  const removeSceneTrigger = usePerformanceStore((s) => s.removeSceneTrigger);
  const upsertShowCue = usePerformanceStore((s) => s.upsertShowCue);
  const removeShowCue = usePerformanceStore((s) => s.removeShowCue);
  const previewShowCue = usePerformanceStore((s) => s.previewShowCue);
  const upsertLightingBinding = usePerformanceStore((s) => s.upsertLightingBinding);
  const removeLightingBinding = usePerformanceStore((s) => s.removeLightingBinding);
  const updateVisualSync = usePerformanceStore((s) => s.updateVisualSync);
  const launchScene = useSessionStore((s) => s.launchScene);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewPayload, setPreviewPayload] = useState<string>("");
  const [newMacroName, setNewMacroName] = useState("Macro");
  const [newMacroSceneId, setNewMacroSceneId] = useState("");
  const [newTriggerSceneId, setNewTriggerSceneId] = useState("");
  const [newTriggerKey, setNewTriggerKey] = useState("F1");
  const [newCueName, setNewCueName] = useState("Drop Strobe");
  const [newCueProtocol, setNewCueProtocol] = useState("osc");
  const [newCueAddress, setNewCueAddress] = useState("/devooo/drop");
  const [newCueValue, setNewCueValue] = useState(1);

  const scenes = project?.session.scenes ?? [];
  const macros = project?.performance_macros ?? [];
  const cues = project?.show_cues ?? [];

  const selectedMacroForBinding = useMemo(() => macros[0]?.id ?? "", [macros]);
  const selectedCueForBinding = useMemo(() => cues[0]?.id ?? "", [cues]);

  if (!project) {
    return <p className="text-xs text-deck-text-muted">No project loaded.</p>;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs uppercase tracking-widest text-deck-cyan">Live Performance / Show Control</h3>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Performance Mode</p>
        <label className="text-[11px] text-deck-text-muted flex items-center gap-2">
          <input
            type="checkbox"
            checked={project.performance_mode.enabled}
            onChange={(event) => void updateMode({ enabled: event.target.checked })}
          />
          Enable performance mode
        </label>
        <label className="text-[11px] text-deck-text-muted flex items-center gap-2">
          <input
            type="checkbox"
            checked={project.performance_mode.safety_lock}
            onChange={(event) => void updateMode({ safety_lock: event.target.checked })}
          />
          Safety lock
        </label>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <label className="text-deck-text-muted flex flex-col gap-1">
            Quantize Beats
            <input
              type="number"
              min={1}
              max={16}
              step={1}
              value={project.performance_mode.launch_quantize_beats}
              onChange={(event) => void updateMode({ launch_quantize_beats: Number(event.target.value) })}
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            />
          </label>
          <label className="text-deck-text-muted flex flex-col gap-1">
            Crossfader
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={project.performance_mode.crossfader}
              onChange={(event) => void updateMode({ crossfader: Number(event.target.value) })}
            />
          </label>
        </div>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Performance Macros</p>
        <div className="grid grid-cols-[1fr_auto_auto] gap-1">
          <input
            value={newMacroName}
            onChange={(event) => setNewMacroName(event.target.value)}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1 text-[11px]"
            placeholder="Macro name"
          />
          <select
            value={newMacroSceneId}
            onChange={(event) => setNewMacroSceneId(event.target.value)}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1 text-[11px]"
          >
            <option value="">No scene</option>
            {scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              setBusy("macro_create");
              setError(null);
              try {
                await upsertMacro({
                  id: v4(),
                  name: newMacroName.trim() || "Macro",
                  description: "Stage macro",
                  enabled: true,
                  launch_scene_id: newMacroSceneId || undefined,
                  track_mutes: [],
                  send_overrides: [],
                  trigger_cue_ids: [],
                  color: "#ff6b1a",
                });
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(null);
              }
            }}
            className="px-2 py-1 rounded border border-deck-cyan/40 bg-deck-cyan/10 text-deck-cyan text-[11px] disabled:opacity-50"
          >
            + Macro
          </button>
        </div>

        <div className="space-y-1 max-h-36 overflow-auto">
          {macros.map((macro) => (
            <div key={macro.id} className="rounded border border-deck-border p-1.5 text-[10px]">
              <div className="flex items-center justify-between">
                <span className="text-deck-text">{macro.name}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={async () => {
                      setBusy("macro_trigger");
                      setError(null);
                      try {
                        await triggerMacro(macro.id);
                        if (macro.launch_scene_id) {
                          await launchScene(macro.launch_scene_id);
                        }
                      } catch (e) {
                        setError(String(e));
                      } finally {
                        setBusy(null);
                      }
                    }}
                    className="px-1.5 py-0.5 rounded border border-deck-magenta/40 text-deck-magenta disabled:opacity-50"
                  >
                    Trigger
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={async () => {
                      setBusy("macro_delete");
                      setError(null);
                      try {
                        await removeMacro(macro.id);
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
              {macro.launch_scene_id && (
                <div className="text-deck-text-muted">Launch scene: {scenes.find((s) => s.id === macro.launch_scene_id)?.name ?? macro.launch_scene_id}</div>
              )}
            </div>
          ))}
          {macros.length === 0 && <p className="text-[11px] text-deck-text-muted">No macros configured.</p>}
        </div>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Scene Triggers</p>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-1">
          <select
            value={newTriggerSceneId}
            onChange={(event) => setNewTriggerSceneId(event.target.value)}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1 text-[11px]"
          >
            <option value="">Select scene</option>
            {scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.name}
              </option>
            ))}
          </select>
          <input
            value={newTriggerKey}
            onChange={(event) => setNewTriggerKey(event.target.value)}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1 text-[11px]"
            placeholder="F1"
          />
          <button
            type="button"
            disabled={!newTriggerSceneId || busy !== null}
            onClick={async () => {
              if (!newTriggerSceneId) return;
              setBusy("trigger_create");
              setError(null);
              try {
                await upsertSceneTrigger({
                  id: v4(),
                  scene_id: newTriggerSceneId,
                  key_binding: newTriggerKey,
                  macro_id: undefined,
                  launch_quantize_beats: project.performance_mode.launch_quantize_beats,
                  enabled: true,
                });
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(null);
              }
            }}
            className="px-2 py-1 rounded border border-deck-border bg-deck-surface text-[11px] disabled:opacity-50"
          >
            +
          </button>
        </div>
        <div className="space-y-1 max-h-24 overflow-auto">
          {project.scene_triggers.map((trigger) => (
            <div key={trigger.id} className="flex justify-between text-[10px] border border-deck-border rounded p-1.5">
              <span className="text-deck-text-muted">
                {trigger.key_binding} → {scenes.find((scene) => scene.id === trigger.scene_id)?.name ?? trigger.scene_id}
              </span>
              <button
                type="button"
                onClick={() => void removeSceneTrigger(trigger.id)}
                className="text-red-300"
              >
                Del
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Show Cues / Lighting Bindings</p>
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1">
          <input
            value={newCueName}
            onChange={(event) => setNewCueName(event.target.value)}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1 text-[11px]"
            placeholder="Cue"
          />
          <select
            value={newCueProtocol}
            onChange={(event) => setNewCueProtocol(event.target.value)}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1 text-[11px]"
          >
            <option value="osc">OSC</option>
            <option value="midi">MIDI</option>
            <option value="dmx">DMX</option>
          </select>
          <input
            value={newCueAddress}
            onChange={(event) => setNewCueAddress(event.target.value)}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1 text-[11px]"
            placeholder="/devooo/drop"
          />
          <button
            type="button"
            disabled={busy !== null}
              onClick={async () => {
                setBusy("cue_create");
                setError(null);
                try {
                  const newCueId = v4();
                  await upsertShowCue({
                    id: newCueId,
                    name: newCueName,
                    protocol: newCueProtocol,
                    address: newCueAddress,
                  value: newCueValue,
                  duration_ms: 300,
                  color_hex: "#ff6b1a",
                  enabled: true,
                });
                  if (selectedMacroForBinding && selectedCueForBinding) {
                    await upsertLightingBinding({
                      id: v4(),
                      macro_id: selectedMacroForBinding,
                      show_cue_id: newCueId,
                      on_scene_launch: true,
                      enabled: true,
                    });
                }
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(null);
              }
            }}
            className="px-2 py-1 rounded border border-deck-border bg-deck-surface text-[11px] disabled:opacity-50"
          >
            +
          </button>
        </div>

        <label className="text-[11px] text-deck-text-muted flex flex-col gap-1">
          Cue Value
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={newCueValue}
            onChange={(event) => setNewCueValue(Number(event.target.value))}
          />
        </label>

        <div className="space-y-1 max-h-28 overflow-auto">
          {cues.map((cue) => (
            <div key={cue.id} className="rounded border border-deck-border p-1.5 text-[10px] space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-deck-text">{cue.name}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={async () => {
                      setError(null);
                      try {
                        const payload = await previewShowCue(cue.id);
                        setPreviewPayload(payload);
                      } catch (e) {
                        setPreviewPayload("");
                        setError(String(e));
                      }
                    }}
                    className="px-1.5 py-0.5 rounded border border-deck-cyan/40 text-deck-cyan"
                  >
                    Preview
                  </button>
                  <button type="button" onClick={() => void removeShowCue(cue.id)} className="text-red-300">
                    Del
                  </button>
                </div>
              </div>
              <div className="text-deck-text-muted">{cue.protocol.toUpperCase()} {cue.address}</div>
            </div>
          ))}
        </div>

        <div className="space-y-1 max-h-20 overflow-auto">
          {project.lighting_cue_bindings.map((binding) => (
            <div key={binding.id} className="flex justify-between text-[10px] border border-deck-border rounded p-1.5">
              <span className="text-deck-text-muted">
                {macros.find((macro) => macro.id === binding.macro_id)?.name ?? binding.macro_id}
                {" → "}
                {cues.find((cue) => cue.id === binding.show_cue_id)?.name ?? binding.show_cue_id}
              </span>
              <button
                type="button"
                onClick={() => void removeLightingBinding(binding.id)}
                className="text-red-300"
              >
                Del
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Visual Sync Bridge</p>
        <label className="text-[11px] text-deck-text-muted flex items-center gap-2">
          <input
            type="checkbox"
            checked={project.visual_sync.enabled}
            onChange={(event) => void updateVisualSync({ enabled: event.target.checked })}
          />
          Enabled
        </label>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <label className="text-deck-text-muted flex flex-col gap-1">
            BPM x
            <input
              type="number"
              min={0.25}
              max={4}
              step={0.01}
              value={project.visual_sync.bpm_multiplier}
              onChange={(event) => void updateVisualSync({ bpm_multiplier: Number(event.target.value) })}
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            />
          </label>
          <label className="text-deck-text-muted flex flex-col gap-1">
            FPS
            <input
              type="number"
              min={24}
              max={240}
              step={1}
              value={project.visual_sync.fps_limit}
              onChange={(event) => void updateVisualSync({ fps_limit: Number(event.target.value) })}
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            />
          </label>
        </div>
        <label className="text-[11px] text-deck-text-muted flex items-center gap-2">
          <input
            type="checkbox"
            checked={project.visual_sync.strobe_on_scene_launch}
            onChange={(event) => void updateVisualSync({ strobe_on_scene_launch: event.target.checked })}
          />
          Strobe on scene launch
        </label>
      </div>

      {previewPayload && (
        <div className="rounded border border-deck-cyan/40 bg-deck-cyan/10 p-2 text-[10px] text-deck-cyan">
          {previewPayload}
        </div>
      )}

      {error && <p className="text-[11px] text-red-300">{error}</p>}
    </div>
  );
}
