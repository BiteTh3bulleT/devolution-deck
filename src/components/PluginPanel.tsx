import { useMemo, useState } from "react";
import * as api from "../api";
import { useProjectStore } from "../stores/projectStore";

function descriptorLabel(descriptor: import("../types").PluginDescriptor): string {
  return `${descriptor.name} (${descriptor.vendor})`;
}

export function PluginPanel() {
  const project = useProjectStore((s) => s.project);
  const load = useProjectStore((s) => s.load);
  const [trackId, setTrackId] = useState<string>("");
  const [scanPath, setScanPath] = useState<string>("");
  const [fromTrackId, setFromTrackId] = useState<string>("");
  const [toTrackId, setToTrackId] = useState<string>("");
  const [sidechainAmount, setSidechainAmount] = useState<number>(0.5);

  const tracks = project?.tracks ?? [];
  const selectedTrack = useMemo(() => tracks.find((track) => track.id === trackId), [tracks, trackId]);

  if (!project) {
    return <p className="text-xs text-deck-text-muted">No project loaded.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-widest text-deck-cyan">Plugins</h3>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={async () => {
              await api.pluginScanDefault();
              await load();
            }}
            className="px-2 py-1 rounded text-[11px] bg-deck-muted border border-deck-border"
          >
            Scan Default
          </button>
        </div>
      </div>

      <div className="flex gap-1">
        <input
          value={scanPath}
          onChange={(event) => setScanPath(event.target.value)}
          placeholder="/path/to/VST3"
          className="flex-1 rounded border border-deck-border bg-deck-panel px-2 py-1 text-xs"
        />
        <button
          type="button"
          onClick={async () => {
            if (!scanPath.trim()) return;
            await api.pluginScanPaths([scanPath.trim()]);
            await load();
          }}
          className="px-2 py-1 rounded text-[11px] bg-deck-muted border border-deck-border"
        >
          Scan Path
        </button>
      </div>

      <label className="text-[11px] text-deck-text-muted flex flex-col gap-1">
        Target Track
        <select
          value={trackId}
          onChange={(event) => setTrackId(event.target.value)}
          className="rounded border border-deck-border bg-deck-panel px-2 py-1 text-xs"
        >
          <option value="">Select track</option>
          {tracks.map((track) => (
            <option key={track.id} value={track.id}>
              {track.name}
            </option>
          ))}
        </select>
      </label>

      {selectedTrack && (
        <>
          <div className="rounded border border-deck-border bg-deck-panel p-2">
            <p className="text-[11px] uppercase tracking-wide text-deck-text-muted mb-1">Plugin Chain</p>
            <div className="space-y-1">
              {selectedTrack.plugin_chain.instances.length === 0 && (
                <p className="text-[11px] text-deck-text-muted">No instances on this track.</p>
              )}
              {selectedTrack.plugin_chain.instances.map((instance, idx) => (
                <div key={instance.id} className="rounded border border-deck-border p-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] text-deck-text truncate">
                      {project.plugin_registry.find((d) => d.id === instance.descriptor_id)?.name ?? instance.descriptor_id}
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={async () => {
                          await api.trackPluginMove(selectedTrack.id, instance.id, Math.max(0, idx - 1));
                          await load();
                        }}
                        className="px-1 py-0.5 text-[10px] border border-deck-border rounded"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await api.trackPluginMove(selectedTrack.id, instance.id, idx + 1);
                          await load();
                        }}
                        className="px-1 py-0.5 text-[10px] border border-deck-border rounded"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await api.trackPluginSetEnabled(selectedTrack.id, instance.id, !instance.enabled);
                          await load();
                        }}
                        className={[
                          "px-1 py-0.5 text-[10px] border rounded",
                          instance.enabled
                            ? "border-deck-cyan/40 text-deck-cyan"
                            : "border-deck-border text-deck-text-muted",
                        ].join(" ")}
                      >
                        {instance.enabled ? "En" : "Dis"}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await api.trackPluginSetBypass(selectedTrack.id, instance.id, !instance.bypassed);
                          await load();
                        }}
                        className="px-1 py-0.5 text-[10px] border border-deck-border rounded"
                      >
                        {instance.bypassed ? "Byp" : "On"}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await api.trackPluginRemove(selectedTrack.id, instance.id);
                          await load();
                        }}
                        className="px-1 py-0.5 text-[10px] border border-red-500/40 rounded text-red-300"
                      >
                        Del
                      </button>
                    </div>
                  </div>

                  {instance.descriptor_id === "builtin://gain" && (
                    <label className="mt-1 block text-[10px] text-deck-text-muted">
                      Gain
                      <input
                        type="range"
                        min={-24}
                        max={24}
                        step={0.1}
                        value={instance.parameters.find((p) => p.id === "gain_db")?.value ?? 0}
                        onChange={(event) =>
                          void api
                            .trackPluginSetParameter(
                              selectedTrack.id,
                              instance.id,
                              "gain_db",
                              Number(event.target.value)
                            )
                            .then(load)
                        }
                        className="w-full"
                      />
                    </label>
                  )}

                  {instance.descriptor_id === "builtin://lowpass" && (
                    <label className="mt-1 block text-[10px] text-deck-text-muted">
                      Cutoff
                      <input
                        type="range"
                        min={60}
                        max={18000}
                        step={1}
                        value={instance.parameters.find((p) => p.id === "cutoff_hz")?.value ?? 9000}
                        onChange={(event) =>
                          void api
                            .trackPluginSetParameter(
                              selectedTrack.id,
                              instance.id,
                              "cutoff_hz",
                              Number(event.target.value)
                            )
                            .then(load)
                        }
                        className="w-full"
                      />
                    </label>
                  )}

                  {instance.descriptor_id === "builtin://compressor" && (
                    <>
                      <label className="mt-1 block text-[10px] text-deck-text-muted">
                        Threshold
                        <input
                          type="range"
                          min={-48}
                          max={0}
                          step={0.1}
                          value={instance.parameters.find((p) => p.id === "threshold_db")?.value ?? -18}
                          onChange={(event) =>
                            void api
                              .trackPluginSetParameter(
                                selectedTrack.id,
                                instance.id,
                                "threshold_db",
                                Number(event.target.value)
                              )
                              .then(load)
                          }
                          className="w-full"
                        />
                      </label>
                      <label className="mt-1 block text-[10px] text-deck-text-muted">
                        Ratio
                        <input
                          type="range"
                          min={1}
                          max={12}
                          step={0.1}
                          value={instance.parameters.find((p) => p.id === "ratio")?.value ?? 3}
                          onChange={(event) =>
                            void api
                              .trackPluginSetParameter(
                                selectedTrack.id,
                                instance.id,
                                "ratio",
                                Number(event.target.value)
                              )
                              .then(load)
                          }
                          className="w-full"
                        />
                      </label>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded border border-deck-border bg-deck-panel p-2">
            <p className="text-[11px] uppercase tracking-wide text-deck-text-muted mb-1">Insert Plugin</p>
            <div className="max-h-36 overflow-auto space-y-1">
              {project.plugin_registry.map((descriptor) => (
                <button
                  key={descriptor.id}
                  type="button"
                  onClick={async () => {
                    await api.trackPluginInsert(selectedTrack.id, descriptor.id);
                    await load();
                  }}
                  className="w-full text-left px-2 py-1 rounded border border-deck-border hover:border-deck-cyan/40 text-[11px]"
                  title={descriptor.binary_path}
                >
                  {descriptorLabel(descriptor)}
                  {descriptor.format === "vst3" && !descriptor.factory_symbol_found && (
                    <span className="ml-1 text-red-300">(invalid)</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Sidechain Routes</p>
        <div className="grid grid-cols-2 gap-1">
          <select
            value={fromTrackId}
            onChange={(event) => setFromTrackId(event.target.value)}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1 text-[11px]"
          >
            <option value="">Source</option>
            {tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.name}
              </option>
            ))}
          </select>
          <select
            value={toTrackId}
            onChange={(event) => setToTrackId(event.target.value)}
            className="rounded border border-deck-border bg-deck-surface px-2 py-1 text-[11px]"
          >
            <option value="">Target</option>
            {tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.name}
              </option>
            ))}
          </select>
        </div>
        <label className="text-[10px] text-deck-text-muted block">
          Amount
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={sidechainAmount}
            onChange={(event) => setSidechainAmount(Number(event.target.value))}
            className="w-full"
          />
        </label>
        <button
          type="button"
          onClick={async () => {
            if (!fromTrackId || !toTrackId || fromTrackId === toTrackId) return;
            await api.sidechainRouteAdd({
              fromTrackId,
              toTrackId,
              amount: sidechainAmount,
            });
            await load();
          }}
          className="w-full rounded border border-deck-cyan/40 bg-deck-cyan/10 text-deck-cyan text-[11px] px-2 py-1"
        >
          Add Sidechain
        </button>
        <div className="space-y-1">
          {project.sidechain_routes.map((route) => (
            <div key={route.id} className="rounded border border-deck-border p-1.5">
              <div className="flex items-center justify-between text-[10px] text-deck-text-muted">
                <span>
                  {tracks.find((t) => t.id === route.from_track_id)?.name ?? "?"} →
                  {" "}
                  {tracks.find((t) => t.id === route.to_track_id)?.name ?? "?"}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await api.sidechainRouteRemove(route.id);
                    await load();
                  }}
                  className="text-red-300"
                >
                  Del
                </button>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={route.amount}
                onChange={(event) =>
                  void api.sidechainRouteUpdate(route.id, Number(event.target.value), route.enabled).then(load)
                }
                className="w-full"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
