import { useEffect, useState } from "react";
import * as api from "../api";
import type { OutputDiagnostics, OutputSettings } from "../types/audioEngine";
import type { LabDevice } from "../types/audioLab";
import { useTransportStore } from "../stores/transportStore";
import { useRecordingStore } from "../stores/recordingStore";

export function AudioEnginePanel() {
  const [status, setStatus] = useState<OutputDiagnostics | null>(null);
  const [draft, setDraft] = useState<OutputSettings | null>(null);
  const [devices, setDevices] = useState<LabDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const transport = useTransportStore(s => s.status);
  const recording = useRecordingStore(s => s.status);
  useEffect(() => {
    let disposed = false;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const next = await api.audioOutputStatus();
        if (!disposed) { setStatus(next); setDraft(previous => previous ?? next.settings); }
      } catch (e) { if (!disposed) setError(String(e)); }
      finally { pending = false; }
    };
    void refresh();
    void api.audioLabDevices().then(list => { if (!disposed) setDevices(list.filter(d => d.direction === "output")); })
      .catch(e => { if (!disposed) setError(String(e)); });
    const timer = setInterval(() => void refresh(), 1000);
    return () => { disposed = true; clearInterval(timer); };
  }, []);
  if (!draft || !status) return <p className="text-xs">{error ?? "Reading audio output…"}</p>;
  const device = devices.find(d => draft.device_name ? d.name === draft.device_name : d.is_default);
  const channels = Math.max(2, ...(device?.channels ?? [status.channels]));
  const pairs = Array.from({ length: Math.floor(Math.min(32, channels) / 2) }, (_, i) => i * 2);
  const patch = (value: Partial<OutputSettings>) => setDraft({ ...draft, ...value });
  const pairLabel = (first: number) => `${first + 1} / ${first + 2}`;
  return <section className="rounded border border-deck-border bg-deck-panel p-3 space-y-3 text-xs" aria-label="Audio output engine">
    <h3 className="text-deck-cyan uppercase tracking-widest">Audio engine / stage outputs</h3>
    <div className="grid grid-cols-2 gap-3">
      <label className="min-w-0 flex flex-col gap-1">Output device<select className="w-full min-w-0" value={draft.device_name ?? ""} onChange={e => patch({ device_name: e.target.value || null, main_channels: [0, 1], cue_channels: null, sample_rate: null })}>
        <option value="">System default</option>
        {draft.device_name && !devices.some(d => d.name === draft.device_name) && <option value={draft.device_name}>{draft.device_name} (unavailable)</option>}
        {devices.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
      </select></label>
      <label className="min-w-0 flex flex-col gap-1">Sample rate<select className="w-full min-w-0" value={draft.sample_rate ?? ""} onChange={e => patch({ sample_rate: e.target.value ? Number(e.target.value) : null })}>
        <option value="">Automatic</option>{[44100, 48000, 96000, 192000].map(rate => <option key={rate} value={rate}>{rate / 1000} kHz</option>)}
      </select></label>
      <label className="min-w-0 flex flex-col gap-1">Requested buffer<select className="w-full min-w-0" value={draft.buffer_frames} onChange={e => patch({ buffer_frames: Number(e.target.value) })}>
        {[64, 128, 256, 512, 1024, 2048].map(frames => <option key={frames} value={frames}>{frames} frames</option>)}
      </select></label>
      <label className="min-w-0 flex flex-col gap-1">Main output pair<select className="w-full min-w-0" value={draft.main_channels[0]} onChange={e => { const n = Number(e.target.value); patch({ main_channels: [n, n + 1], cue_channels: null }); }}>
        {pairs.map(first => <option key={first} value={first}>{pairLabel(first)}</option>)}
      </select></label>
      <label className="min-w-0 flex flex-col gap-1">Headphone cue pair<select className="w-full min-w-0" value={draft.cue_channels?.[0] ?? ""} onChange={e => { const n = Number(e.target.value); patch({ cue_channels: e.target.value === "" ? null : [n, n + 1] }); }}>
        <option value="">Disabled</option>{pairs.filter(first => !draft.main_channels.includes(first)).map(first => <option key={first} value={first}>{pairLabel(first)}</option>)}
      </select></label>
      <label className="min-w-0 flex flex-col gap-1">Cue level (dB)<input type="number" min={-60} max={0} step={1} value={draft.cue_gain_db} onChange={e => patch({ cue_gain_db: Number(e.target.value) })} /></label>
    </div>
    <p className="text-deck-text-muted">Cue needs at least four output channels on one device. Stop decks, transport, previews and recording before applying. The driver may choose a different buffer size; the queue follows the observed size.</p>
    <div className="flex flex-wrap gap-2">
      <button disabled={busy || transport !== "stopped" || recording !== "idle"} onClick={async () => {
        setBusy(true); setError(null);
        try { const next = await api.audioOutputConfigure(draft); setStatus(next); setDraft(next.settings); }
        catch (e) { setError(String(e)); } finally { setBusy(false); }
      }}>Apply output settings</button>
      <button disabled={busy} onClick={async () => {
        try { setStatus(await api.audioOutputResetStatistics()); } catch (e) { setError(String(e)); }
      }}>Reset counters</button>
      <button disabled={busy} onClick={async () => {
        try { setDevices((await api.audioLabDevices()).filter(d => d.direction === "output")); } catch (e) { setError(String(e)); }
      }}>Refresh devices</button>
    </div>
    <div className="deck-lcd p-3" aria-live="off">
      <p>{status.device_name ?? "No output"} · {status.host} · {status.sample_format} · {status.channels} channels</p>
      <p>Device {status.sample_rate / 1000} kHz · Engine {status.engine_sample_rate / 1000} kHz · Observed buffer {status.observed_callback_frames} frames</p>
      <p>Queue {status.queued_frames}/{status.software_queue_target_frames} · Callbacks {status.callbacks} · Average / max {status.callback_average_us.toFixed(1)} / {status.callback_max_us.toFixed(1)} µs</p>
      <p>Callback load {status.callback_load_percent.toFixed(2)}% · Underruns {status.underrun_callbacks} ({status.underrun_frames} frames) · Clipped {status.clipped_samples} · Invalid {status.invalid_samples}</p>
      <p>Estimated buffered output: {status.estimated_output_latency_ms?.toFixed(1) ?? "—"} ms. This excludes hardware latency and is not a round-trip measurement.</p>
    </div>
    {(error || status.error) && <p role="alert" className="text-red-300">{error ?? status.error}</p>}
  </section>;
}
