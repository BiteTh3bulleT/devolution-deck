import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CueSequence,
  CueSequenceStep,
  CueTrigger,
  DeviceBinding,
  DmxBridgeConfig,
  FallbackProfile,
  LightingCue,
  PanicAction,
  SongCueMap,
  VisualCue,
} from "../types";
import { v4 } from "../utils/uuid";
import { useProjectStore } from "../stores/projectStore";
import { useShowStore } from "../stores/showStore";
import { useTransportStore } from "../stores/transportStore";

function fmtTime(ms?: number): string {
  if (!ms) return "n/a";
  return new Date(ms).toLocaleTimeString();
}

async function runTask(
  action: () => Promise<unknown>,
  setBusy: (value: string | null) => void,
  setError: (value: string | null) => void,
  busyKey: string
) {
  setBusy(busyKey);
  setError(null);
  try {
    await action();
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error));
  } finally {
    setBusy(null);
  }
}

export function ShowControlPanel() {
  const project = useProjectStore((state) => state.project);
  const load = useProjectStore((state) => state.load);
  const transportPositionSecs = useTransportStore((state) => state.positionSecs);
  const transportStatus = useTransportStore((state) => state.status);

  const refreshDashboard = useShowStore((state) => state.refreshDashboard);
  const updateDmxBridge = useShowStore((state) => state.updateDmxBridge);
  const upsertLightingCue = useShowStore((state) => state.upsertLightingCue);
  const removeLightingCue = useShowStore((state) => state.removeLightingCue);
  const executeLightingCue = useShowStore((state) => state.executeLightingCue);
  const upsertVisualCue = useShowStore((state) => state.upsertVisualCue);
  const removeVisualCue = useShowStore((state) => state.removeVisualCue);
  const executeVisualCue = useShowStore((state) => state.executeVisualCue);
  const upsertSequence = useShowStore((state) => state.upsertSequence);
  const removeSequence = useShowStore((state) => state.removeSequence);
  const startSequence = useShowStore((state) => state.startSequence);
  const stopSequence = useShowStore((state) => state.stopSequence);
  const tickSequence = useShowStore((state) => state.tickSequence);
  const upsertCueTrigger = useShowStore((state) => state.upsertCueTrigger);
  const removeCueTrigger = useShowStore((state) => state.removeCueTrigger);
  const fireCueTrigger = useShowStore((state) => state.fireCueTrigger);
  const upsertSongCueMap = useShowStore((state) => state.upsertSongCueMap);
  const removeSongCueMap = useShowStore((state) => state.removeSongCueMap);
  const triggerSongCueMap = useShowStore((state) => state.triggerSongCueMap);
  const upsertDeviceBinding = useShowStore((state) => state.upsertDeviceBinding);
  const removeDeviceBinding = useShowStore((state) => state.removeDeviceBinding);
  const testDeviceBinding = useShowStore((state) => state.testDeviceBinding);
  const upsertFallbackProfile = useShowStore((state) => state.upsertFallbackProfile);
  const removeFallbackProfile = useShowStore((state) => state.removeFallbackProfile);
  const applyFallbackProfile = useShowStore((state) => state.applyFallbackProfile);
  const setBlackout = useShowStore((state) => state.setBlackout);
  const panic = useShowStore((state) => state.panic);
  const resetSafety = useShowStore((state) => state.resetSafety);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastPayload, setLastPayload] = useState<string>("");
  const [lastActions, setLastActions] = useState<string[]>([]);
  const [autoTick, setAutoTick] = useState(false);
  const [transitionEvent, setTransitionEvent] = useState("drop");

  const [bridgeDraft, setBridgeDraft] = useState<DmxBridgeConfig>({
    enabled: false,
    protocol: "artnet",
    host: "127.0.0.1",
    port: 6454,
    fps_limit: 40,
  });

  const [cueName, setCueName] = useState("Drop Strobe");
  const [cueUniverse, setCueUniverse] = useState(0);
  const [cueChannel, setCueChannel] = useState(1);
  const [cueValue, setCueValue] = useState(255);
  const [cueFadeMs, setCueFadeMs] = useState(0);
  const [cueHoldMs, setCueHoldMs] = useState(250);

  const [visualName, setVisualName] = useState("Pulse");
  const [visualHost, setVisualHost] = useState("127.0.0.1");
  const [visualPort, setVisualPort] = useState(9000);
  const [visualAddress, setVisualAddress] = useState("/devolution/pulse");
  const [visualPayload, setVisualPayload] = useState("1");

  const [sequenceName, setSequenceName] = useState("Drop Timeline");
  const [stepSequenceId, setStepSequenceId] = useState("");
  const [stepOffsetBeats, setStepOffsetBeats] = useState(0);
  const [stepDurationBeats, setStepDurationBeats] = useState(1);
  const [stepLightingCueId, setStepLightingCueId] = useState("");
  const [stepVisualCueId, setStepVisualCueId] = useState("");
  const [stepShowTriggerId, setStepShowTriggerId] = useState("");

  const [triggerName, setTriggerName] = useState("Scene Drop");
  const [triggerEvent, setTriggerEvent] = useState("drop");
  const [triggerSource, setTriggerSource] = useState("manual");
  const [triggerDeckId, setTriggerDeckId] = useState("");
  const [triggerSceneId, setTriggerSceneId] = useState("");
  const [triggerLibraryItemId, setTriggerLibraryItemId] = useState("");
  const [triggerSequenceId, setTriggerSequenceId] = useState("");
  const [triggerLightingCueId, setTriggerLightingCueId] = useState("");

  const [mapLibraryItemId, setMapLibraryItemId] = useState("");
  const [mapSceneId, setMapSceneId] = useState("");
  const [mapSequenceId, setMapSequenceId] = useState("");
  const [mapLightingCueId, setMapLightingCueId] = useState("");
  const [mapVisualCueId, setMapVisualCueId] = useState("");

  const [bindingName, setBindingName] = useState("Pad 1");
  const [bindingType, setBindingType] = useState<"midi" | "osc" | "dmx">("midi");
  const [bindingTargetTriggerId, setBindingTargetTriggerId] = useState("");
  const [bindingTargetSequenceId, setBindingTargetSequenceId] = useState("");
  const [bindingMidiNote, setBindingMidiNote] = useState(60);
  const [bindingOscAddress, setBindingOscAddress] = useState("/pad/1");
  const [bindingDmxUniverse, setBindingDmxUniverse] = useState(0);
  const [bindingDmxChannel, setBindingDmxChannel] = useState(1);
  const [bindingDmxValue, setBindingDmxValue] = useState(255);

  const [fallbackName, setFallbackName] = useState("Safe Amber");
  const [blackoutFadeMs, setBlackoutFadeMs] = useState(0);

  const lastAutoBeatRef = useRef(0);

  const scenes = project?.session.scenes ?? [];
  const libraryItems = project?.library_items ?? [];
  const bpm = project?.bpm ?? 120;
  const transportBeats = (transportPositionSecs * bpm) / 60;

  useEffect(() => {
    if (!project) return;
    setBridgeDraft(project.show_project.dmx_bridge);
    if (!stepSequenceId && project.show_project.cue_sequences.length > 0) {
      setStepSequenceId(project.show_project.cue_sequences[0].id);
    }
  }, [project, stepSequenceId]);

  useEffect(() => {
    if (!autoTick) return;
    const timer = window.setInterval(() => {
      const latestProject = useProjectStore.getState().project;
      const latestTransport = useTransportStore.getState();
      if (!latestProject) return;
      if (latestTransport.status !== "playing") return;
      if (!latestProject.show_project.active_sequence_id) return;
      const beat = (latestTransport.positionSecs * latestProject.bpm) / 60;
      if (beat <= lastAutoBeatRef.current + 0.125) return;
      lastAutoBeatRef.current = beat;
      void tickSequence(beat).then((actions) => {
        if (actions.length > 0) {
          setLastActions(actions);
          void refreshDashboard();
          void load();
        }
      });
    }, 120);
    return () => window.clearInterval(timer);
  }, [autoTick, tickSequence, refreshDashboard, load]);

  const libraryById = useMemo(() => {
    return new Map(libraryItems.map((item) => [item.id, item]));
  }, [libraryItems]);

  if (!project) {
    return <p className="text-xs text-deck-text-muted">No project loaded.</p>;
  }

  const show = project.show_project;
  const deckAItem = show.dashboard.deck_a_item_id ? libraryById.get(show.dashboard.deck_a_item_id) : undefined;
  const deckBItem = show.dashboard.deck_b_item_id ? libraryById.get(show.dashboard.deck_b_item_id) : undefined;
  const activeScene = show.dashboard.active_scene_id
    ? scenes.find((entry) => entry.id === show.dashboard.active_scene_id)
    : undefined;

  const saveBridge = () =>
    runTask(
      () => updateDmxBridge(bridgeDraft),
      setBusy,
      setError,
      "bridge_save"
    );

  const createLightingCue = () =>
    runTask(
      async () => {
        const cue: LightingCue = {
          id: v4(),
          name: cueName.trim() || "Lighting Cue",
          universe: Math.max(0, cueUniverse),
          values: [{ channel: Math.max(1, cueChannel), value: Math.max(0, Math.min(255, cueValue)) }],
          fade_ms: Math.max(0, cueFadeMs),
          hold_ms: Math.max(0, cueHoldMs),
          tags: ["stage", transitionEvent],
          enabled: true,
        };
        await upsertLightingCue(cue);
      },
      setBusy,
      setError,
      "cue_create"
    );

  const createVisualCue = () =>
    runTask(
      async () => {
        const cue: VisualCue = {
          id: v4(),
          name: visualName.trim() || "Visual Cue",
          host: visualHost.trim() || "127.0.0.1",
          port: Math.max(1, visualPort),
          address: visualAddress.trim() || "/devolution/cue",
          payload: visualPayload,
          enabled: true,
        };
        await upsertVisualCue(cue);
      },
      setBusy,
      setError,
      "visual_create"
    );

  const createSequence = () =>
    runTask(
      async () => {
        const sequence: CueSequence = {
          id: v4(),
          name: sequenceName.trim() || "Cue Sequence",
          steps: [],
          loop_enabled: false,
          enabled: true,
        };
        await upsertSequence(sequence);
        setStepSequenceId(sequence.id);
      },
      setBusy,
      setError,
      "sequence_create"
    );

  const appendStep = () =>
    runTask(
      async () => {
        const sequence = show.cue_sequences.find((entry) => entry.id === stepSequenceId);
        if (!sequence) {
          throw new Error("Select a valid sequence first");
        }
        const next: CueSequenceStep = {
          id: v4(),
          offset_beats: Math.max(0, stepOffsetBeats),
          duration_beats: Math.max(0.25, stepDurationBeats),
          lighting_cue_id: stepLightingCueId || undefined,
          visual_cue_id: stepVisualCueId || undefined,
          show_trigger_id: stepShowTriggerId || undefined,
          enabled: true,
        };
        await upsertSequence({ ...sequence, steps: [...sequence.steps, next] });
      },
      setBusy,
      setError,
      "step_add"
    );

  const createCueTrigger = () =>
    runTask(
      async () => {
        const trigger: CueTrigger = {
          id: v4(),
          name: triggerName.trim() || "Cue Trigger",
          trigger_source: triggerSource,
          trigger_event: triggerEvent.trim() || "drop",
          deck_id: triggerDeckId || undefined,
          scene_id: triggerSceneId || undefined,
          library_item_id: triggerLibraryItemId || undefined,
          cue_sequence_id: triggerSequenceId || undefined,
          lighting_cue_id: triggerLightingCueId || undefined,
          quantize_beats: 4,
          enabled: true,
        };
        await upsertCueTrigger(trigger);
      },
      setBusy,
      setError,
      "trigger_create"
    );

  const createSongCueMap = () =>
    runTask(
      async () => {
        const map: SongCueMap = {
          id: v4(),
          library_item_id: mapLibraryItemId || undefined,
          scene_id: mapSceneId || undefined,
          transition_event: transitionEvent,
          cue_sequence_id: mapSequenceId || undefined,
          lighting_cue_id: mapLightingCueId || undefined,
          visual_cue_id: mapVisualCueId || undefined,
          enabled: true,
        };
        await upsertSongCueMap(map);
      },
      setBusy,
      setError,
      "map_create"
    );

  const createDeviceBinding = () =>
    runTask(
      async () => {
        const binding: DeviceBinding = {
          id: v4(),
          name: bindingName.trim() || "Device Binding",
          enabled: true,
          target_trigger_id: bindingTargetTriggerId || undefined,
          target_sequence_id: bindingTargetSequenceId || undefined,
          notes: "Phase 7 mapped binding",
        };
        if (bindingType === "midi") {
          binding.midi_binding = {
            channel: 1,
            status: "note_on",
            data1: Math.max(0, Math.min(127, bindingMidiNote)),
            data2: 127,
          };
        } else if (bindingType === "osc") {
          binding.osc_binding = {
            address: bindingOscAddress || "/devolution/binding",
            host: "127.0.0.1",
            port: 9000,
            argument_type: "f32",
          };
        } else {
          binding.dmx_binding = {
            universe: Math.max(0, bindingDmxUniverse),
            channel: Math.max(1, bindingDmxChannel),
            value: Math.max(0, Math.min(255, bindingDmxValue)),
          };
        }
        await upsertDeviceBinding(binding);
      },
      setBusy,
      setError,
      "binding_create"
    );

  const createFallback = () =>
    runTask(
      async () => {
        const profile: FallbackProfile = {
          id: v4(),
          name: fallbackName.trim() || "Fallback",
          dmx_universes: show.dmx_universes,
          scene_id: show.dashboard.active_scene_id,
          note: "Snapshot from live universes",
        };
        await upsertFallbackProfile(profile);
      },
      setBusy,
      setError,
      "fallback_create"
    );

  const panicAction: PanicAction = {
    stop_transport: true,
    stop_decks: true,
    blackout: true,
    reset_sequences: true,
    apply_fallback: true,
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs uppercase tracking-widest text-deck-cyan">Stage Show Engine</h3>

      <section className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Unified Performance Dashboard</p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void runTask(() => refreshDashboard().then(() => undefined), setBusy, setError, "dash_refresh")}
            className="px-2 py-1 rounded border border-deck-cyan/40 text-[11px] text-deck-cyan disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="rounded border border-deck-border bg-deck-surface p-2">
            <div className="text-deck-text-muted">Active Scene</div>
            <div className="text-deck-text">{activeScene?.name ?? "None"}</div>
          </div>
          <div className="rounded border border-deck-border bg-deck-surface p-2">
            <div className="text-deck-text-muted">Active Sequence</div>
            <div className="text-deck-text">{show.dashboard.active_sequence_id ?? "None"}</div>
          </div>
          <div className="rounded border border-deck-border bg-deck-surface p-2">
            <div className="text-deck-text-muted">Deck A</div>
            <div className="text-deck-text truncate">{deckAItem ? `${deckAItem.artist} - ${deckAItem.title}` : "Empty"}</div>
          </div>
          <div className="rounded border border-deck-border bg-deck-surface p-2">
            <div className="text-deck-text-muted">Deck B</div>
            <div className="text-deck-text truncate">{deckBItem ? `${deckBItem.artist} - ${deckBItem.title}` : "Empty"}</div>
          </div>
          <div className="rounded border border-deck-border bg-deck-surface p-2">
            <div className="text-deck-text-muted">Safety</div>
            <div className="text-deck-text">
              {show.safety_state.panic_active ? "PANIC" : show.safety_state.blackout.enabled ? "BLACKOUT" : "READY"}
            </div>
          </div>
          <div className="rounded border border-deck-border bg-deck-surface p-2">
            <div className="text-deck-text-muted">Transport Beat</div>
            <div className="text-deck-text">
              {transportBeats.toFixed(2)} ({transportStatus})
            </div>
          </div>
        </div>
        {show.dashboard.status_banner && <p className="text-[11px] text-deck-amber">{show.dashboard.status_banner}</p>}
        <p className="text-[10px] text-deck-text-muted">
          Last sync {fmtTime(show.dashboard.last_sync_unix_ms)} · Fail count {show.safety_state.fail_count}
        </p>
      </section>

      <section className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Safety / Fail-safe</p>
        <div className="grid grid-cols-[1fr_78px_78px_78px] gap-1">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void runTask(() => panic(panicAction).then(() => undefined), setBusy, setError, "panic")}
            className="px-2 py-1 rounded border border-red-400/40 text-red-200 bg-red-900/20 disabled:opacity-50"
          >
            Panic
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void runTask(() => setBlackout(true, blackoutFadeMs).then(() => undefined), setBusy, setError, "blackout_on")}
            className="px-2 py-1 rounded border border-deck-amber/40 text-deck-amber disabled:opacity-50"
          >
            Blackout
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void runTask(() => setBlackout(false, blackoutFadeMs).then(() => undefined), setBusy, setError, "blackout_off")}
            className="px-2 py-1 rounded border border-deck-border text-deck-text-muted disabled:opacity-50"
          >
            Restore
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void runTask(() => resetSafety().then(() => undefined), setBusy, setError, "safety_reset")}
            className="px-2 py-1 rounded border border-deck-cyan/40 text-deck-cyan disabled:opacity-50"
          >
            Reset
          </button>
        </div>
        <label className="text-[10px] text-deck-text-muted flex items-center gap-2">
          Blackout Fade (ms)
          <input
            type="number"
            min={0}
            max={10000}
            value={blackoutFadeMs}
            onChange={(event) => setBlackoutFadeMs(Number(event.target.value))}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1 text-[10px] w-24"
          />
        </label>
        {show.safety_state.last_error && <p className="text-[10px] text-red-300">Last error: {show.safety_state.last_error}</p>}
      </section>

      <section className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">DMX Bridge</p>
        <div className="grid grid-cols-[70px_1fr_80px_70px_60px_auto] gap-1 text-[11px]">
          <label className="flex items-center gap-1 text-deck-text-muted">
            <input
              type="checkbox"
              checked={bridgeDraft.enabled}
              onChange={(event) => setBridgeDraft((prev) => ({ ...prev, enabled: event.target.checked }))}
            />
            On
          </label>
          <input
            value={bridgeDraft.host}
            onChange={(event) => setBridgeDraft((prev) => ({ ...prev, host: event.target.value }))}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            placeholder="host"
          />
          <input
            type="number"
            value={bridgeDraft.port}
            onChange={(event) => setBridgeDraft((prev) => ({ ...prev, port: Number(event.target.value) }))}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1"
          />
          <input
            value={bridgeDraft.protocol}
            onChange={(event) => setBridgeDraft((prev) => ({ ...prev, protocol: event.target.value }))}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1"
          />
          <input
            type="number"
            value={bridgeDraft.fps_limit}
            onChange={(event) => setBridgeDraft((prev) => ({ ...prev, fps_limit: Number(event.target.value) }))}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1"
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void saveBridge()}
            className="px-2 py-1 rounded border border-deck-cyan/40 text-deck-cyan disabled:opacity-50"
          >
            Save
          </button>
        </div>
        <div className="text-[10px] text-deck-text-muted">
          Universes tracked: {show.dmx_universes.length} · Blackout{" "}
          {show.safety_state.blackout.enabled ? "ON" : "OFF"}
        </div>
      </section>

      <section className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Lighting / Visual Cues</p>
        <div className="grid grid-cols-[1fr_62px_62px_62px_62px_62px_auto] gap-1 text-[11px]">
          <input value={cueName} onChange={(event) => setCueName(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1" />
          <input type="number" value={cueUniverse} onChange={(event) => setCueUniverse(Number(event.target.value))} className="rounded border border-deck-border bg-deck-surface px-2 py-1" placeholder="u" />
          <input type="number" value={cueChannel} onChange={(event) => setCueChannel(Number(event.target.value))} className="rounded border border-deck-border bg-deck-surface px-2 py-1" placeholder="ch" />
          <input type="number" value={cueValue} onChange={(event) => setCueValue(Number(event.target.value))} className="rounded border border-deck-border bg-deck-surface px-2 py-1" placeholder="val" />
          <input type="number" value={cueFadeMs} onChange={(event) => setCueFadeMs(Number(event.target.value))} className="rounded border border-deck-border bg-deck-surface px-2 py-1" placeholder="fade" />
          <input type="number" value={cueHoldMs} onChange={(event) => setCueHoldMs(Number(event.target.value))} className="rounded border border-deck-border bg-deck-surface px-2 py-1" placeholder="hold" />
          <button type="button" disabled={busy !== null} onClick={() => void createLightingCue()} className="px-2 py-1 rounded border border-deck-cyan/40 text-deck-cyan disabled:opacity-50">+ DMX</button>
        </div>
        <div className="grid grid-cols-[1fr_80px_1fr_1fr_1fr_auto] gap-1 text-[11px]">
          <input value={visualName} onChange={(event) => setVisualName(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1" />
          <input type="number" value={visualPort} onChange={(event) => setVisualPort(Number(event.target.value))} className="rounded border border-deck-border bg-deck-surface px-2 py-1" />
          <input value={visualHost} onChange={(event) => setVisualHost(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1" />
          <input value={visualAddress} onChange={(event) => setVisualAddress(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1" />
          <input value={visualPayload} onChange={(event) => setVisualPayload(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1" placeholder="payload" />
          <button type="button" disabled={busy !== null} onClick={() => void createVisualCue()} className="px-2 py-1 rounded border border-deck-magenta/40 text-deck-magenta disabled:opacity-50">+ Visual</button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="space-y-1 max-h-32 overflow-auto">
            {show.lighting_cues.map((cue) => (
              <div key={cue.id} className="rounded border border-deck-border p-1.5 flex items-center justify-between">
                <span className="truncate text-deck-text-muted">{cue.name} U{cue.universe}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="px-1.5 py-0.5 rounded border border-deck-cyan/40 text-deck-cyan"
                    onClick={() =>
                      void runTask(
                        () => executeLightingCue(cue.id).then((payload) => setLastPayload(payload)),
                        setBusy,
                        setError,
                        "lighting_exec"
                      )
                    }
                  >
                    Go
                  </button>
                  <button type="button" className="text-red-300" onClick={() => void removeLightingCue(cue.id)}>
                    Del
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-1 max-h-32 overflow-auto">
            {show.visual_cues.map((cue) => (
              <div key={cue.id} className="rounded border border-deck-border p-1.5 flex items-center justify-between">
                <span className="truncate text-deck-text-muted">{cue.name}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="px-1.5 py-0.5 rounded border border-deck-magenta/40 text-deck-magenta"
                    onClick={() =>
                      void runTask(
                        () => executeVisualCue(cue.id).then((payload) => setLastPayload(payload)),
                        setBusy,
                        setError,
                        "visual_exec"
                      )
                    }
                  >
                    Go
                  </button>
                  <button type="button" className="text-red-300" onClick={() => void removeVisualCue(cue.id)}>
                    Del
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Cue Sequencing Timeline</p>
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-1 text-[11px]">
          <input value={sequenceName} onChange={(event) => setSequenceName(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1" />
          <button type="button" disabled={busy !== null} onClick={() => void createSequence()} className="px-2 py-1 rounded border border-deck-border disabled:opacity-50">+ Sequence</button>
          <button
            type="button"
            disabled={!show.active_sequence_id || busy !== null}
            onClick={() => void runTask(() => stopSequence(), setBusy, setError, "sequence_stop")}
            className="px-2 py-1 rounded border border-deck-amber/40 text-deck-amber disabled:opacity-50"
          >
            Stop
          </button>
          <label className="px-2 py-1 rounded border border-deck-border text-deck-text-muted flex items-center gap-1">
            <input type="checkbox" checked={autoTick} onChange={(event) => setAutoTick(event.target.checked)} />
            Auto Tick
          </label>
        </div>
        <div className="grid grid-cols-[1fr_80px_80px_1fr_1fr_1fr_auto] gap-1 text-[11px]">
          <select value={stepSequenceId} onChange={(event) => setStepSequenceId(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1">
            <option value="">Sequence</option>
            {show.cue_sequences.map((seq) => (
              <option key={seq.id} value={seq.id}>
                {seq.name}
              </option>
            ))}
          </select>
          <input type="number" value={stepOffsetBeats} onChange={(event) => setStepOffsetBeats(Number(event.target.value))} className="rounded border border-deck-border bg-deck-surface px-2 py-1" placeholder="offset" />
          <input type="number" value={stepDurationBeats} onChange={(event) => setStepDurationBeats(Number(event.target.value))} className="rounded border border-deck-border bg-deck-surface px-2 py-1" placeholder="dur" />
          <select value={stepLightingCueId} onChange={(event) => setStepLightingCueId(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1">
            <option value="">DMX cue</option>
            {show.lighting_cues.map((cue) => (
              <option key={cue.id} value={cue.id}>
                {cue.name}
              </option>
            ))}
          </select>
          <select value={stepVisualCueId} onChange={(event) => setStepVisualCueId(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1">
            <option value="">Visual cue</option>
            {show.visual_cues.map((cue) => (
              <option key={cue.id} value={cue.id}>
                {cue.name}
              </option>
            ))}
          </select>
          <select value={stepShowTriggerId} onChange={(event) => setStepShowTriggerId(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1">
            <option value="">Show trigger</option>
            {project.show_triggers.map((trigger) => (
              <option key={trigger.id} value={trigger.id}>
                {trigger.name}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy !== null} onClick={() => void appendStep()} className="px-2 py-1 rounded border border-deck-cyan/40 text-deck-cyan disabled:opacity-50">+ Step</button>
        </div>
        <div className="space-y-1 max-h-36 overflow-auto text-[10px]">
          {show.cue_sequences.map((sequence) => (
            <div key={sequence.id} className="rounded border border-deck-border p-1.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-deck-text">{sequence.name} ({sequence.steps.length} steps)</span>
                <div className="flex gap-1">
                  <button type="button" className="px-1.5 py-0.5 rounded border border-deck-cyan/40 text-deck-cyan" onClick={() => void startSequence(sequence.id)}>Start</button>
                  <button type="button" className="px-1.5 py-0.5 rounded border border-deck-border text-deck-text-muted" onClick={() => void tickSequence(transportBeats).then((actions) => setLastActions(actions))}>Tick</button>
                  <button type="button" className="text-red-300" onClick={() => void removeSequence(sequence.id)}>Del</button>
                </div>
              </div>
              <div className="text-deck-text-muted">
                {sequence.steps
                  .slice()
                  .sort((a, b) => a.offset_beats - b.offset_beats)
                  .map((step) => `@${step.offset_beats.toFixed(2)}b`)
                  .join("  ")}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Song/Scene Mapping + Trigger Events</p>
        <div className="grid grid-cols-[120px_1fr_1fr_1fr_1fr_1fr_auto] gap-1 text-[11px]">
          <input value={transitionEvent} onChange={(event) => setTransitionEvent(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1" />
          <select value={mapLibraryItemId} onChange={(event) => setMapLibraryItemId(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1">
            <option value="">Library item</option>
            {libraryItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.artist} - {item.title}
              </option>
            ))}
          </select>
          <select value={mapSceneId} onChange={(event) => setMapSceneId(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1">
            <option value="">Scene</option>
            {scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.name}
              </option>
            ))}
          </select>
          <select value={mapSequenceId} onChange={(event) => setMapSequenceId(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1">
            <option value="">Sequence</option>
            {show.cue_sequences.map((sequence) => (
              <option key={sequence.id} value={sequence.id}>
                {sequence.name}
              </option>
            ))}
          </select>
          <select value={mapLightingCueId} onChange={(event) => setMapLightingCueId(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1">
            <option value="">DMX cue</option>
            {show.lighting_cues.map((cue) => (
              <option key={cue.id} value={cue.id}>
                {cue.name}
              </option>
            ))}
          </select>
          <select value={mapVisualCueId} onChange={(event) => setMapVisualCueId(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1">
            <option value="">Visual cue</option>
            {show.visual_cues.map((cue) => (
              <option key={cue.id} value={cue.id}>
                {cue.name}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy !== null} onClick={() => void createSongCueMap()} className="px-2 py-1 rounded border border-deck-cyan/40 text-deck-cyan disabled:opacity-50">+ Map</button>
        </div>
        <div className="flex gap-1 text-[10px]">
          {["intro", "build", "drop", "breakdown", "outro", "scene_change"].map((name) => (
            <button key={name} type="button" onClick={() => setTransitionEvent(name)} className="px-1.5 py-0.5 rounded border border-deck-border text-deck-text-muted">
              {name}
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              void runTask(
                () =>
                  triggerSongCueMap(
                    show.dashboard.deck_a_item_id,
                    show.dashboard.active_scene_id,
                    transitionEvent
                  ).then((actions) => setLastActions(actions)),
                setBusy,
                setError,
                "map_fire"
              )
            }
            className="px-2 py-0.5 rounded border border-deck-magenta/40 text-deck-magenta"
          >
            Fire From Deck A + Active Scene
          </button>
        </div>
        <div className="space-y-1 max-h-28 overflow-auto text-[10px]">
          {show.song_cue_maps.map((map) => (
            <div key={map.id} className="rounded border border-deck-border p-1.5 flex items-center justify-between gap-2">
              <span className="truncate text-deck-text-muted">
                {map.transition_event} · {map.library_item_id ?? "any track"} · {map.scene_id ?? "any scene"}
              </span>
              <button type="button" className="text-red-300" onClick={() => void removeSongCueMap(map.id)}>
                Del
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Cue Triggers + Device Bindings</p>
        <div className="grid grid-cols-[1fr_90px_90px_62px_1fr_1fr_1fr_1fr_auto] gap-1 text-[11px]">
          <input value={triggerName} onChange={(event) => setTriggerName(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1" />
          <input value={triggerSource} onChange={(event) => setTriggerSource(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1" />
          <input value={triggerEvent} onChange={(event) => setTriggerEvent(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1" />
          <select value={triggerDeckId} onChange={(event) => setTriggerDeckId(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1">
            <option value="">Deck</option>
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
          <select value={triggerLibraryItemId} onChange={(event) => setTriggerLibraryItemId(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1">
            <option value="">Library item</option>
            {libraryItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.artist} - {item.title}
              </option>
            ))}
          </select>
          <select value={triggerSequenceId} onChange={(event) => setTriggerSequenceId(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1">
            <option value="">Sequence</option>
            {show.cue_sequences.map((sequence) => (
              <option key={sequence.id} value={sequence.id}>
                {sequence.name}
              </option>
            ))}
          </select>
          <select value={triggerLightingCueId} onChange={(event) => setTriggerLightingCueId(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1">
            <option value="">DMX cue</option>
            {show.lighting_cues.map((cue) => (
              <option key={cue.id} value={cue.id}>
                {cue.name}
              </option>
            ))}
          </select>
          <select value={triggerSceneId} onChange={(event) => setTriggerSceneId(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1">
            <option value="">Scene</option>
            {scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.name}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy !== null} onClick={() => void createCueTrigger()} className="px-2 py-1 rounded border border-deck-cyan/40 text-deck-cyan disabled:opacity-50">+ Trigger</button>
        </div>
        <div className="grid grid-cols-[1fr_80px_1fr_1fr_1fr_72px_72px_72px_72px_auto] gap-1 text-[11px]">
          <input value={bindingName} onChange={(event) => setBindingName(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1" />
          <select value={bindingType} onChange={(event) => setBindingType(event.target.value as "midi" | "osc" | "dmx")} className="rounded border border-deck-border bg-deck-surface px-2 py-1">
            <option value="midi">MIDI</option>
            <option value="osc">OSC</option>
            <option value="dmx">DMX</option>
          </select>
          <select value={bindingTargetTriggerId} onChange={(event) => setBindingTargetTriggerId(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1">
            <option value="">Target trigger</option>
            {show.cue_triggers.map((trigger) => (
              <option key={trigger.id} value={trigger.id}>
                {trigger.name}
              </option>
            ))}
          </select>
          <select value={bindingTargetSequenceId} onChange={(event) => setBindingTargetSequenceId(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1">
            <option value="">Target sequence</option>
            {show.cue_sequences.map((sequence) => (
              <option key={sequence.id} value={sequence.id}>
                {sequence.name}
              </option>
            ))}
          </select>
          <input value={bindingOscAddress} onChange={(event) => setBindingOscAddress(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1" placeholder="/osc/address" />
          <input type="number" value={bindingMidiNote} onChange={(event) => setBindingMidiNote(Number(event.target.value))} className="rounded border border-deck-border bg-deck-surface px-2 py-1" />
          <input type="number" value={bindingDmxUniverse} onChange={(event) => setBindingDmxUniverse(Number(event.target.value))} className="rounded border border-deck-border bg-deck-surface px-2 py-1" />
          <input type="number" value={bindingDmxChannel} onChange={(event) => setBindingDmxChannel(Number(event.target.value))} className="rounded border border-deck-border bg-deck-surface px-2 py-1" />
          <input type="number" value={bindingDmxValue} onChange={(event) => setBindingDmxValue(Number(event.target.value))} className="rounded border border-deck-border bg-deck-surface px-2 py-1" />
          <button type="button" disabled={busy !== null} onClick={() => void createDeviceBinding()} className="px-2 py-1 rounded border border-deck-magenta/40 text-deck-magenta disabled:opacity-50">+ Bind</button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="space-y-1 max-h-28 overflow-auto">
            {show.cue_triggers.map((trigger) => (
              <div key={trigger.id} className="rounded border border-deck-border p-1.5 flex items-center justify-between">
                <span className="truncate text-deck-text-muted">{trigger.name} · {trigger.trigger_event}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      void runTask(
                        () => fireCueTrigger(trigger.id).then((actions) => setLastActions(actions)),
                        setBusy,
                        setError,
                        "trigger_fire"
                      )
                    }
                    className="px-1.5 py-0.5 rounded border border-deck-cyan/40 text-deck-cyan"
                  >
                    Fire
                  </button>
                  <button type="button" className="text-red-300" onClick={() => void removeCueTrigger(trigger.id)}>
                    Del
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-1 max-h-28 overflow-auto">
            {show.device_bindings.map((binding) => (
              <div key={binding.id} className="rounded border border-deck-border p-1.5 flex items-center justify-between">
                <span className="truncate text-deck-text-muted">{binding.name}</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      void runTask(
                        () => testDeviceBinding(binding.id).then((payload) => setLastPayload(payload)),
                        setBusy,
                        setError,
                        "binding_test"
                      )
                    }
                    className="px-1.5 py-0.5 rounded border border-deck-cyan/40 text-deck-cyan"
                  >
                    Test
                  </button>
                  <button type="button" className="text-red-300" onClick={() => void removeDeviceBinding(binding.id)}>
                    Del
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Fallback Profiles</p>
        <div className="grid grid-cols-[1fr_auto] gap-1 text-[11px]">
          <input value={fallbackName} onChange={(event) => setFallbackName(event.target.value)} className="rounded border border-deck-border bg-deck-surface px-2 py-1" />
          <button type="button" disabled={busy !== null} onClick={() => void createFallback()} className="px-2 py-1 rounded border border-deck-border disabled:opacity-50">Snapshot</button>
        </div>
        <div className="space-y-1 max-h-24 overflow-auto text-[10px]">
          {show.fallback_profiles.map((profile) => (
            <div key={profile.id} className="rounded border border-deck-border p-1.5 flex items-center justify-between">
              <span className="truncate text-deck-text-muted">{profile.name} · U{profile.dmx_universes.length}</span>
              <div className="flex gap-1">
                <button type="button" className="px-1.5 py-0.5 rounded border border-deck-cyan/40 text-deck-cyan" onClick={() => void applyFallbackProfile(profile.id)}>
                  Apply
                </button>
                <button type="button" className="text-red-300" onClick={() => void removeFallbackProfile(profile.id)}>
                  Del
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded border border-deck-border bg-deck-panel p-2 space-y-1">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Execution Feed</p>
        {lastPayload && <p className="text-[10px] text-deck-cyan break-all">Payload: {lastPayload}</p>}
        {lastActions.length > 0 && (
          <div className="rounded border border-deck-border bg-deck-surface p-1.5 space-y-0.5 text-[10px] text-deck-magenta">
            {lastActions.map((action, index) => (
              <p key={`${index}-${action}`}>{action}</p>
            ))}
          </div>
        )}
        <div className="max-h-24 overflow-auto space-y-0.5 text-[10px] text-deck-text-muted">
          {show.dashboard.recent_events
            .slice()
            .reverse()
            .map((event) => (
              <p key={event.id}>
                {fmtTime(event.unix_ms)} · {event.source}/{event.event} · {event.payload}
              </p>
            ))}
        </div>
      </section>

      {error && <p className="text-[11px] text-red-300">{error}</p>}
      {busy && <p className="text-[10px] text-deck-text-muted">Working: {busy}</p>}
    </div>
  );
}
