import { useProjectStore } from "../stores/projectStore";
import { useMixerStore } from "../stores/mixerStore";
import { useTransportStore } from "../stores/transportStore";

function dbLabel(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} dB`;
}

export function MixerPanel() {
  const project = useProjectStore((s) => s.project);
  const positionSecs = useTransportStore((s) => s.positionSecs);
  const addReturnTrack = useMixerStore((s) => s.addReturnTrack);
  const addBusTrack = useMixerStore((s) => s.addBusTrack);
  const assignTrackToBus = useMixerStore((s) => s.assignTrackToBus);
  const setTrackVolumeDb = useMixerStore((s) => s.setTrackVolumeDb);
  const setTrackPan = useMixerStore((s) => s.setTrackPan);
  const toggleTrackMute = useMixerStore((s) => s.toggleTrackMute);
  const toggleTrackSolo = useMixerStore((s) => s.toggleTrackSolo);
  const addSendRoute = useMixerStore((s) => s.addSendRoute);
  const setSendAmount = useMixerStore((s) => s.setSendAmount);
  const toggleSendEnabled = useMixerStore((s) => s.toggleSendEnabled);
  const effectiveTrackVolumeDb = useMixerStore((s) => s.effectiveTrackVolumeDb);

  const tracks = project?.tracks ?? [];
  const returns = project?.routing.returns ?? [];
  const buses = project?.routing.buses ?? [];
  const sends = project?.routing.sends ?? [];

  if (!project) {
    return <p className="text-xs text-deck-text-muted">No project loaded.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-widest text-deck-cyan">Mixer / Routing</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void addReturnTrack()}
            className="px-2 py-1 rounded text-[11px] bg-deck-muted hover:bg-deck-graphite border border-deck-border"
          >
            + Return
          </button>
          <button
            type="button"
            onClick={() => void addBusTrack()}
            className="px-2 py-1 rounded text-[11px] bg-deck-muted hover:bg-deck-graphite border border-deck-border"
          >
            + Group
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {tracks.map((track) => {
          const autoVolume = effectiveTrackVolumeDb(project, track.id, positionSecs);
          return (
            <div key={track.id} className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-deck-text">{track.name}</p>
                  <p className="text-[10px] text-deck-text-muted">
                    Base {dbLabel(track.volume_db)} · Auto {dbLabel(autoVolume)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void toggleTrackSolo(track.id)}
                    className={[
                      "px-2 py-1 rounded text-[11px] border",
                      track.solo
                        ? "bg-amber-400/20 border-amber-300/40 text-amber-100"
                        : "bg-deck-muted border-deck-border text-deck-text-muted",
                    ].join(" ")}
                  >
                    S
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleTrackMute(track.id)}
                    className={[
                      "px-2 py-1 rounded text-[11px] border",
                      track.muted
                        ? "bg-red-500/20 border-red-400/40 text-red-200"
                        : "bg-deck-muted border-deck-border text-deck-text-muted",
                    ].join(" ")}
                  >
                    M
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <label className="flex flex-col gap-1">
                  <span className="text-deck-text-muted">Volume</span>
                  <input
                    type="range"
                    min={-60}
                    max={12}
                    step={0.1}
                    value={track.volume_db}
                    onChange={(event) => void setTrackVolumeDb(track.id, Number(event.target.value))}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-deck-text-muted">Pan</span>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.01}
                    value={track.pan}
                    onChange={(event) => void setTrackPan(track.id, Number(event.target.value))}
                  />
                </label>
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                <select
                  value={track.group_track_id ?? ""}
                  onChange={(event) => void assignTrackToBus(track.id, event.target.value || null)}
                  className="bg-deck-surface border border-deck-border rounded px-2 py-1 text-[11px]"
                >
                  <option value="">No Group</option>
                  {buses.map((bus) => (
                    <option key={bus.id} value={bus.id}>
                      {bus.name}
                    </option>
                  ))}
                </select>
                {returns.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void addSendRoute(track.id, returns[0].id)}
                    className="px-2 py-1 rounded text-[11px] bg-deck-cyan/10 border border-deck-cyan/30 text-deck-cyan"
                  >
                    + Send
                  </button>
                )}
              </div>

              {sends
                .filter((send) => send.from_track_id === track.id)
                .map((send) => {
                  const ret = returns.find((candidate) => candidate.id === send.to_return_id);
                  return (
                    <div key={send.id} className="flex items-center gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => void toggleSendEnabled(send.id)}
                        className={[
                          "px-1.5 py-0.5 rounded border",
                          send.enabled
                            ? "border-deck-cyan/40 text-deck-cyan"
                            : "border-deck-border text-deck-text-muted",
                        ].join(" ")}
                      >
                        {send.enabled ? "On" : "Off"}
                      </button>
                      <span className="min-w-[56px] text-deck-text-muted">{ret?.name ?? "Return"}</span>
                      <input
                        className="flex-1"
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={send.amount}
                        onChange={(event) => void setSendAmount(send.id, Number(event.target.value))}
                      />
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>

      {returns.length > 0 && (
        <div className="rounded border border-deck-border bg-deck-panel p-2">
          <p className="text-[11px] uppercase tracking-wide text-deck-text-muted mb-1">Returns</p>
          <div className="space-y-1">
            {returns.map((ret) => (
              <div key={ret.id} className="text-[11px] text-deck-text-muted flex items-center justify-between">
                <span>{ret.name}</span>
                <span>{dbLabel(ret.gain_db)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
