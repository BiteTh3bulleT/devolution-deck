import { useEffect, useState } from "react";
import * as api from "../api";
import { useProjectStore } from "../stores/projectStore";
import { useMixerStore } from "../stores/mixerStore";
import { useTransportStore } from "../stores/transportStore";

function dbLabel(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} dB`;
}

function MeterBar({ peak, variant = "stereo" }: { peak: number; variant?: "mono" | "stereo" | "master" }) {
  const width = Math.min(100, Math.round(peak * 100));
  const color = peak >= 0.99 ? "bg-red-400" : peak > 0.8 ? "bg-amber-300" : "bg-deck-cyan";
  const shellClass =
    variant === "master"
      ? "devooo-meter-master-shell"
      : variant === "mono"
        ? "devooo-meter-mono-shell"
        : "devooo-meter-stereo-shell";
  return (
    <div className={`devooo-meter-bar-shell ${shellClass}`}>
      <div className="h-1.5 w-full rounded bg-deck-surface/80 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function MixerPanel() {
  const project = useProjectStore((s) => s.project);
  const setProject = useProjectStore((s) => s.setProject);
  const positionSecs = useTransportStore((s) => s.positionSecs);
  const transportStatus = useTransportStore((s) => s.status);
  const [meters, setMeters] = useState<api.MeterReport | null>(null);

  useEffect(() => {
    if (transportStatus !== "playing") {
      setMeters(null);
      return;
    }
    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const report = await api.playbackMeters();
        if (!cancelled) setMeters(report.is_playing ? report : null);
      } catch {
        if (!cancelled) setMeters(null);
      }
    }, 100);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [transportStatus]);
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
    <div className="devooo-mixer-shell p-3 space-y-3">
      <div className="devooo-mixer-section-card p-3 flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-widest text-deck-cyan">Mixer / Routing</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void addReturnTrack()}
            className="devooo-button-small px-3 py-1 text-[11px] text-deck-text-muted"
          >
            + Return
          </button>
          <button
            type="button"
            onClick={() => void addBusTrack()}
            className="devooo-button-small px-3 py-1 text-[11px] text-deck-text-muted"
          >
            + Group
          </button>
        </div>
      </div>

      <div className="devooo-mixer-master-card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-deck-text">Master</p>
          <span className="text-[10px] text-deck-text-muted">{dbLabel(project.master_gain_db ?? 0)}</span>
        </div>
        <label className="flex flex-col gap-1 text-[10px]">
          <span className="text-deck-text-muted">Master Gain</span>
          <input
            type="range"
            min={-60}
            max={12}
            step={0.1}
            value={project.master_gain_db ?? 0}
            className="devooo-fader-horizontal-slot-no-switch"
            onChange={async (event) => {
              const next = { ...project, master_gain_db: Number(event.target.value) };
              setProject(next);
              try {
                await api.projectUpdate(next);
              } catch {
                // keep optimistic value; next project sync corrects drift
              }
            }}
          />
        </label>
        <MeterBar peak={meters?.master_peak ?? 0} variant="master" />
      </div>

      <div className="space-y-2">
        {tracks.map((track) => {
          const autoVolume = effectiveTrackVolumeDb(project, track.id, positionSecs);
          const trackPeak = meters?.tracks.find((meter) => meter.track_id === track.id)?.peak ?? 0;
          return (
            <div key={track.id} className="devooo-mixer-track-card p-4 space-y-2">
              <MeterBar peak={trackPeak} variant="stereo" />
              <div className="flex items-center justify-between">
                <div className="devooo-channel-name-plate px-3 py-1 min-w-0">
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
                      "devooo-solo-button px-2 py-1 text-[11px]",
                      track.solo
                        ? "text-amber-100"
                        : "text-deck-text-muted",
                    ].join(" ")}
                  >
                    S
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleTrackMute(track.id)}
                    className={[
                      "devooo-mute-button px-2 py-1 text-[11px]",
                      track.muted
                        ? "text-red-200"
                        : "text-deck-text-muted",
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
                    className="devooo-fader-horizontal-slot-no-switch"
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
                    className="devooo-fader-horizontal-slot-no-switch"
                    onChange={(event) => void setTrackPan(track.id, Number(event.target.value))}
                  />
                </label>
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                <select
                  value={track.group_track_id ?? ""}
                  onChange={(event) => void assignTrackToBus(track.id, event.target.value || null)}
                  className="devooo-routing-select px-3 py-1 text-[11px]"
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
                    className="devooo-button-small px-3 py-1 text-[11px] text-deck-cyan"
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
                          "px-2 py-0.5",
                          send.enabled
                            ? "devooo-chip-active text-deck-cyan"
                            : "devooo-chip-inactive text-deck-text-muted",
                        ].join(" ")}
                      >
                        {send.enabled ? "On" : "Off"}
                      </button>
                      <span className="min-w-[56px] text-deck-text-muted">{ret?.name ?? "Return"}</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={send.amount}
                        className="devooo-send-amount-slot flex-1"
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
        <div className="devooo-mixer-return-card p-4">
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
