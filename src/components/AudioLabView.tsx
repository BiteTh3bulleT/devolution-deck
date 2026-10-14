import { useEffect, useRef, useState } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import * as api from "../api";
import { useAudioLabStore } from "../stores/audioLabStore";
import { useProjectStore } from "../stores/projectStore";
import { useRecordingStore } from "../stores/recordingStore";
import { useTransportStore } from "../stores/transportStore";
import { DEFAULT_PROCESS } from "../types/audioLab";
import type { AudioAnalysis, ProcessSettings, SignalSettings } from "../types/audioLab";

const field = "w-full rounded border border-deck-border bg-deck-surface px-2 py-1.5 text-sm text-deck-text";
const button = "rounded border border-deck-border bg-deck-panel px-3 py-2 text-sm text-deck-text hover:border-deck-cyan disabled:opacity-40 disabled:cursor-not-allowed";
function Numeric({ label, value, onChange, min, max, step = 1 }: { label: string; value: number | null; onChange: (n: number | null) => void; min?: number; max?: number; step?: number }) {
  return <label className="block text-xs text-deck-text-muted">{label}<input type="number" aria-label={label} value={value ?? ""} min={min} max={max} step={step} placeholder="Off" onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} className={`${field} mt-1`} /></label>;
}
function Measurements({ title, data }: { title: string; data: AudioAnalysis }) {
  const metrics = [
    ["Sample peak", `${data.peak_dbfs.toFixed(2)} dBFS`], ["RMS", `${data.rms_dbfs.toFixed(2)} dBFS`],
    ["Integrated loudness", data.integrated_lufs === null ? "Silence" : `${data.integrated_lufs.toFixed(2)} LUFS`],
    ["Crest factor", `${data.crest_db.toFixed(2)} dB`], ["Correlation", data.stereo_correlation.toFixed(3)],
    ["Clipped samples", data.clipped_samples.toLocaleString()], ["DC left / right", `${data.dc_left.toFixed(5)} / ${data.dc_right.toFixed(5)}`],
    ["Below −60 dBFS", `${data.silence_secs.toFixed(2)} s`],
  ];
  return <section><h3 className="mb-3 text-sm font-semibold text-deck-cyan">{title}</h3><dl className="grid grid-cols-2 xl:grid-cols-4 gap-x-4 gap-y-3">{metrics.map(([label, value]) => <div key={label}><dt className="text-xs text-deck-text-muted">{label}</dt><dd className="mt-1 font-mono text-sm text-deck-text">{value}</dd></div>)}</dl></section>;
}
function Charts({ data, name, selection, onSelect }: { data: AudioAnalysis; name: string; selection: [number, number]; onSelect: (start: number, end: number) => void }) {
  const dragStart = useRef<number | null>(null);
  const point = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(); return Math.max(0, Math.min(data.duration_secs, (event.clientX - rect.left) / rect.width * data.duration_secs));
  };
  const wavePath = (channel: "left" | "right", center: number) => {
    const top = data.waveform.map((p, i) => `${i / Math.max(1, data.waveform.length - 1) * 1000},${center - p[`${channel}_max`] * 40}`);
    const bottom = data.waveform.map((p, i) => `${i / Math.max(1, data.waveform.length - 1) * 1000},${center - p[`${channel}_min`] * 40}`).reverse();
    return [...top, ...bottom].join(" ");
  };
  const spectrum = data.spectrum.filter((p) => p.frequency_hz >= 20).map((p) => {
    const x = Math.log10(p.frequency_hz / 20) / Math.log10(data.sample_rate / 2 / 20) * 1000;
    const y = 150 - (Math.max(-120, Math.min(0, p.dbfs)) + 120) / 120 * 150;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  return <section className="space-y-4">
    <div><h3 className="mb-2 text-sm font-semibold">Stereo waveform <span className="font-normal text-xs text-deck-text-muted">· drag to select time</span></h3>
      <svg viewBox="0 0 1000 190" preserveAspectRatio="none" className="w-full h-44 bg-deck-surface rounded cursor-crosshair touch-none" role="img" aria-label={`Stereo waveform of ${name}, ${data.duration_secs.toFixed(2)} seconds`}
        onPointerDown={(e) => { dragStart.current = point(e); e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerUp={(e) => { if (dragStart.current !== null) { const a = dragStart.current, b = point(e); if (Math.abs(a - b) > 0.01) onSelect(Math.min(a, b), Math.max(a, b)); dragStart.current = null; } }}>
        <line x1="0" y1="50" x2="1000" y2="50" stroke="var(--deck-border)" /><line x1="0" y1="140" x2="1000" y2="140" stroke="var(--deck-border)" />
        <polygon points={wavePath("left", 50)} fill="var(--deck-cyan)" opacity="0.75" /><polygon points={wavePath("right", 140)} fill="var(--deck-magenta)" opacity="0.75" />
        <rect x={selection[0] / Math.max(0.001, data.duration_secs) * 1000} y="0" width={Math.max(0, selection[1] - selection[0]) / Math.max(0.001, data.duration_secs) * 1000} height="190" fill="var(--deck-accent)" opacity="0.16" />
        <text x="8" y="20" fill="var(--deck-text)" fontSize="14">L · amplitude ±1</text><text x="8" y="110" fill="var(--deck-text)" fontSize="14">R · amplitude ±1</text>
      </svg><div className="flex justify-between text-xs text-deck-text-muted mt-1"><span>0 s</span><span>Time (seconds)</span><span>{data.duration_secs.toFixed(2)} s</span></div>
    </div>
    <div><h3 className="mb-2 text-sm font-semibold">Average spectrum <span className="font-normal text-xs text-deck-text-muted">· stereo channel power · Hann FFT</span></h3>
      <svg viewBox="0 0 1000 170" className="w-full h-40 bg-deck-surface rounded" role="img" aria-label="Average spectrum, frequency in hertz, level in dBFS">
        {[0, 50, 100, 150].map((y) => <g key={y}><line x1="0" x2="1000" y1={y} y2={y} stroke="var(--deck-border)" /><text x="4" y={Math.max(12, y - 3)} fill="var(--deck-text-muted)" fontSize="12">{-(y / 150 * 120)} dBFS</text></g>)}
        <polyline points={spectrum} fill="none" stroke="var(--deck-cyan)" strokeWidth="2" />
      </svg><div className="flex justify-between text-xs text-deck-text-muted mt-1"><span>20 Hz</span><span>Frequency (Hz, logarithmic)</span><span>{(data.sample_rate / 2000).toFixed(1)} kHz</span></div>
    </div><p className="text-xs text-deck-text-muted">Source: {name} · {data.duration_secs.toFixed(2)} s · {(data.sample_rate / 1000).toFixed(1)} kHz. Mono sources are duplicated for stereo analysis. Loudness uses K-weighted absolute and relative gating; it is an estimate, not a certified compliance measurement.</p>
  </section>;
}
export function AudioLabView() {
  const project = useProjectStore((s) => s.project); const lab = useAudioLabStore();
  const recordingStatus = useRecordingStore((s) => s.status); const [trackId, setTrackId] = useState(""); const requestId = useRef(0);
  const asset = project?.media.find((a) => a.id === lab.assetId); const resultAsset = project?.media.find((a) => a.id === lab.resultId);
  const audioTracks = project?.tracks.filter((t) => t.track_type === "audio") ?? [];
  const task = async (label: string, action: () => Promise<void>) => {
    if (useAudioLabStore.getState().busy) return;
    useAudioLabStore.setState({ busy: label, error: null, message: null });
    try { await action(); } catch (e) { useAudioLabStore.setState({ error: String(e) }); }
    finally { useAudioLabStore.setState({ busy: null }); }
  };
  const select = async (id: string) => {
    const source = useProjectStore.getState().project?.media.find((a) => a.id === id); if (!source) return;
    const request = ++requestId.current; useAudioLabStore.setState({ assetId: id, analysis: null, resultId: null, resultAnalysis: null, settings: { ...DEFAULT_PROCESS } });
    const analysis = await api.audioLabAnalyze(source.path);
    if (request === requestId.current) useAudioLabStore.setState({ analysis });
  };
  useEffect(() => { if (!asset && lab.assetId) useAudioLabStore.setState({ assetId: null, analysis: null, resultId: null, resultAnalysis: null }); }, [asset, lab.assetId]);
  const update = (key: keyof ProcessSettings, value: number | null) => lab.patchSettings({ [key]: value });
  const importResult = async (path: string, analysis: AudioAnalysis) => {
    if (useProjectStore.getState().project?.id !== project?.id) throw new Error("WAV saved, but the project changed. Open it in the desired project library.");
    const imported = await api.mediaImportAudio(path); await useProjectStore.getState().load();
    useAudioLabStore.setState({ resultId: imported.id, resultAnalysis: analysis, message: "WAV saved and added to the project library." });
  };
  const record = async () => {
    if (recordingStatus === "recording" || recordingStatus === "count_in") {
      await useRecordingStore.getState().stopRecording();
      const error = useRecordingStore.getState().error; if (error) throw Error(error);
      const latest = useProjectStore.getState().project?.media.at(-1); if (latest) await select(latest.id);
    } else {
      let target = audioTracks.find((t) => t.id === trackId) ?? audioTracks[0];
      if (!target) { target = await api.trackAdd("Lab recording", "audio"); setTrackId(target.id); }
      await api.trackSetArmed(target.id, true); await useProjectStore.getState().load();
      useRecordingStore.getState().setDevice(lab.inputDevice ?? "");
      if (!lab.inputDevice) useRecordingStore.setState({ selectedDevice: null });
      await useRecordingStore.getState().startRecording(target.id, useTransportStore.getState().positionSecs);
      if (useRecordingStore.getState().error) throw Error(useRecordingStore.getState().error ?? "Recording failed");
    }
  };
  return <main className="flex-1 min-w-0 overflow-auto bg-deck-bg text-deck-text p-5 lg:p-7">
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs tracking-widest uppercase text-deck-cyan">Native audio workspace</p><h1 className="font-display text-2xl mt-1">Audio Lab</h1><p className="text-sm text-deck-text-muted mt-2">Inspect a sound, shape it, compare the result, and bring it into your session.</p></div>
        <button className={button} disabled={!!lab.busy} onClick={() => void task("Importing audio", async () => { const selected = await openDialog({ multiple: false, filters: [{ name: "Audio", extensions: ["wav", "mp3", "flac", "ogg", "m4a", "aac"] }] }); if (typeof selected === "string") { const imported = await api.mediaImportAudio(selected); await useProjectStore.getState().load(); await select(imported.id); } })}>Open audio file</button></header>
      {(lab.error || lab.message || lab.busy) && <div role={lab.error ? "alert" : "status"} className={`rounded border p-3 text-sm ${lab.error ? "border-red-500 text-red-300" : "border-deck-border text-deck-cyan"}`}>{lab.error ?? lab.busy ?? lab.message}</div>}
      <label className="block text-xs text-deck-text-muted">Project library<select aria-label="Project library" className={`${field} mt-1`} value={lab.assetId ?? ""} disabled={!!lab.busy} onChange={(e) => void task("Analyzing audio", () => select(e.target.value))}><option value="">Choose a sound to analyze</option>{project?.media.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.duration_secs.toFixed(2)} s</option>)}</select></label>
      {asset && lab.analysis && <>
        <Measurements title="Source measurements" data={lab.analysis} />
        <Charts data={lab.analysis} name={asset.name} selection={[lab.settings.start_secs, lab.settings.end_secs ?? lab.analysis.duration_secs]} onSelect={(start, end) => lab.patchSettings({ start_secs: Number(start.toFixed(4)), end_secs: Number(end.toFixed(4)) })} />
        <section className="border-y border-deck-border py-5 space-y-4"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Sample editor & processing</h2><button className={button} disabled={!!lab.busy} onClick={() => useAudioLabStore.setState({ settings: { ...DEFAULT_PROCESS } })}>Reset processing</button></div>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
            <Numeric label="Start (s)" value={lab.settings.start_secs} min={0} max={lab.analysis.duration_secs} step={0.001} onChange={(v) => update("start_secs", v ?? 0)} />
            <Numeric label="End (s)" value={lab.settings.end_secs} min={0} max={lab.analysis.duration_secs} step={0.001} onChange={(v) => update("end_secs", v)} />
            <Numeric label="Gain (dB)" value={lab.settings.gain_db} min={-60} max={24} step={0.1} onChange={(v) => update("gain_db", v ?? 0)} />
            <Numeric label="Peak normalize (dBFS)" value={lab.settings.normalize_dbfs} min={-60} max={0} step={0.1} onChange={(v) => update("normalize_dbfs", v)} />
            <Numeric label="Fade in (ms)" value={lab.settings.fade_in_ms} min={0} onChange={(v) => update("fade_in_ms", v ?? 0)} />
            <Numeric label="Fade out (ms)" value={lab.settings.fade_out_ms} min={0} onChange={(v) => update("fade_out_ms", v ?? 0)} />
            <Numeric label="High-pass (Hz)" value={lab.settings.highpass_hz} min={10} max={lab.analysis.sample_rate / 2 - 1} onChange={(v) => update("highpass_hz", v)} />
            <Numeric label="Low-pass (Hz)" value={lab.settings.lowpass_hz} min={10} max={lab.analysis.sample_rate / 2 - 1} onChange={(v) => update("lowpass_hz", v)} />
            <Numeric label="Compressor threshold (dB)" value={lab.settings.compressor_threshold_db} min={-60} max={0} step={0.1} onChange={(v) => update("compressor_threshold_db", v)} />
            <Numeric label="Compressor ratio" value={lab.settings.compressor_ratio} min={1} max={20} step={0.5} onChange={(v) => update("compressor_ratio", v ?? 4)} />
            <Numeric label="Limiter ceiling (dBFS)" value={lab.settings.limiter_ceiling_dbfs} min={-24} max={0} step={0.1} onChange={(v) => update("limiter_ceiling_dbfs", v)} />
            <Numeric label="Duration multiplier" value={lab.settings.stretch_ratio} min={0.5} max={2} step={0.01} onChange={(v) => update("stretch_ratio", v ?? 1)} />
            <label className="text-xs text-deck-text-muted">Output sample rate<select aria-label="Output sample rate" className={`${field} mt-1`} value={lab.settings.output_sample_rate ?? ""} onChange={(e) => update("output_sample_rate", e.target.value ? Number(e.target.value) : null)}><option value="">Keep source rate</option>{[22050, 44100, 48000, 88200, 96000, 192000].map((rate) => <option key={rate} value={rate}>{rate} Hz</option>)}</select></label>
          </div>
          <div className="flex flex-wrap gap-5 text-sm">{([['reverse', 'Reverse'], ['mono', 'Sum to mono'], ['invert_left', 'Invert left'], ['invert_right', 'Invert right']] as const).map(([key, label]) => <label key={key} className="flex gap-2 items-center"><input type="checkbox" checked={lab.settings[key]} onChange={(e) => lab.patchSettings({ [key]: e.target.checked })} />{label}</label>)}</div>
          <p className="text-xs text-deck-text-muted">Blank optional values are off. Processing order: trim → reverse/stretch → channel/gain → filters → compressor → peak normalize → fades → resample → sample limiter. Sources are preserved; exports are stereo 32-bit float WAV.</p>
          <div className="flex flex-wrap gap-2"><button className={button} disabled={!!lab.busy} onClick={() => void task("Auditioning source", () => api.audioLabPreview(asset.path, DEFAULT_PROCESS))}>Audition source</button><button className={button} disabled={!!lab.busy} onClick={() => void task("Preparing audition", () => api.audioLabPreview(asset.path, lab.settings))}>Audition processed</button><button className={button} onClick={() => void useTransportStore.getState().stop()}>Stop audio</button>
            <button className={`${button} text-deck-cyan border-deck-cyan`} disabled={!!lab.busy} onClick={() => void task("Processing and exporting", async () => { const path = await saveDialog({ defaultPath: `${asset.name}_processed.wav`, filters: [{ name: "WAV audio", extensions: ["wav"] }] }); if (!path) return; const result = await api.audioLabProcess(asset.path, path, lab.settings); await importResult(result.path, result.analysis); })}>Export processed WAV</button></div>
        </section>
      </>}
      {resultAsset && lab.resultAnalysis && <section className="space-y-4"><Measurements title="Exported result measurements" data={lab.resultAnalysis} /><p className="text-xs text-deck-text-muted break-all">{resultAsset.path}</p><div className="flex flex-wrap gap-2"><button className={button} disabled={!!lab.busy} onClick={() => void task("Analyzing result", () => select(resultAsset.id))}>Use result as source</button><button className={button} disabled={!!lab.busy} onClick={() => void task("Auditioning result", () => api.audioLabPreview(resultAsset.path, DEFAULT_PROCESS))}>Audition result</button></div></section>}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-7">
        <section className="space-y-4"><h2 className="text-lg font-semibold">Signal generator</h2><div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <label className="text-xs text-deck-text-muted">Signal<select aria-label="Signal" className={`${field} mt-1`} value={lab.signal.kind} onChange={(e) => lab.patchSignal({ kind: e.target.value as SignalSettings['kind'] })}>{['sine', 'square', 'triangle', 'white', 'pink', 'sweep', 'impulse'].map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></label>
          <Numeric label="Signal duration (s)" value={lab.signal.duration_secs} min={0.01} max={300} step={0.1} onChange={(v) => lab.patchSignal({ duration_secs: v ?? 5 })} />
          <Numeric label="Frequency (Hz)" value={lab.signal.frequency_hz} min={1} max={lab.signal.sample_rate * 0.45} onChange={(v) => lab.patchSignal({ frequency_hz: v ?? 440 })} />
          <Numeric label="Sweep end (Hz)" value={lab.signal.end_frequency_hz} min={1} max={lab.signal.sample_rate * 0.45} onChange={(v) => lab.patchSignal({ end_frequency_hz: v ?? 20000 })} />
          <Numeric label="Signal level (dBFS)" value={lab.signal.level_dbfs} min={-60} max={0} onChange={(v) => lab.patchSignal({ level_dbfs: v ?? -18 })} />
          <label className="text-xs text-deck-text-muted">Signal sample rate<select aria-label="Signal sample rate" value={lab.signal.sample_rate} onChange={(e) => lab.patchSignal({ sample_rate: Number(e.target.value) })} className={`${field} mt-1`}>{[44100, 48000, 96000].map((rate) => <option key={rate} value={rate}>{rate} Hz</option>)}</select></label>
        </div><button className={button} disabled={!!lab.busy} onClick={() => void task("Generating signal", async () => { const path = await saveDialog({ defaultPath: `${lab.signal.kind}_${lab.signal.frequency_hz}Hz.wav`, filters: [{ name: "WAV audio", extensions: ["wav"] }] }); if (!path) return; const result = await api.audioLabGenerate(path, lab.signal); await importResult(result.path, result.analysis); })}>Generate WAV & add to library</button></section>
        <section className="space-y-4"><h2 className="text-lg font-semibold">Recording & devices</h2><div className="grid grid-cols-2 gap-3"><label className="text-xs text-deck-text-muted">Capture input<select aria-label="Capture input" value={lab.inputDevice ?? ""} onChange={(e) => useAudioLabStore.setState({ inputDevice: e.target.value || null })} className={`${field} mt-1`}><option value="">System default input</option>{lab.devices.filter((d) => d.direction === "input").map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}</select></label>
          <label className="text-xs text-deck-text-muted">Destination track<select aria-label="Destination track" className={`${field} mt-1`} value={trackId} onChange={(e) => setTrackId(e.target.value)}><option value="">First audio track / create one</option>{audioTracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label></div>
          <div className="flex flex-wrap gap-2"><button className={button} disabled={!!lab.busy || (recordingStatus === "stopping" || recordingStatus === "starting")} onClick={() => void task("Updating capture", record)}>{recordingStatus === "recording" || recordingStatus === "count_in" ? "Stop & analyze take" : "Record to track"}</button><button className={button} disabled={!!lab.busy} onClick={() => void task("Checking devices", async () => { const devices = await api.audioLabDevices(); useAudioLabStore.setState({ devices, message: `Found ${devices.length} audio input/output devices.` }); })}>Refresh device diagnostics</button></div>
          <p className="text-xs text-deck-text-muted">Capture: {recordingStatus.replace("_", " ")} · recordings stay in Documents / DEVOLUTION DECK / Recordings. A take appears on the armed track and can be analyzed here.</p>
          {lab.devices.map((d) => <div key={`${d.direction}:${d.name}`} className="border-b border-deck-border py-2 text-xs"><strong className="text-deck-text">{d.name}</strong><p className="text-deck-text-muted mt-1">{d.direction} {d.is_default ? '· default' : ''} · {d.channels.join('/')} channels · {d.sample_rates.map((r) => `${r / 1000} kHz`).join(' / ')} · {d.formats.join(' / ')}</p></div>)}
        </section>
      </div>
      {(asset || resultAsset) && <section className="border-t border-deck-border pt-4 flex flex-wrap items-center gap-3"><button className={button} disabled={!!lab.busy} onClick={() => void task("Placing audio", async () => { const source = resultAsset ?? asset; if (!source) return; let track = audioTracks.find((t) => t.id === trackId) ?? audioTracks[0]; if (!track) track = await api.trackAdd("Lab audio", "audio"); await api.clipPlace({ media_asset_id: source.id, track_index: track.index, start_secs: useTransportStore.getState().positionSecs, source_offset_secs: 0, duration_secs: source.duration_secs }); await useProjectStore.getState().load(); useAudioLabStore.setState({ message: `Placed ${source.name} on ${track.name} at the playhead.` }); })}>Place {resultAsset ? 'result' : 'source'} on timeline</button><span className="text-xs text-deck-text-muted">At the current playhead · chosen destination track</span></section>}
    </div>
  </main>;
}
