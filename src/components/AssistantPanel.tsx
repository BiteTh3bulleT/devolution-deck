import { useMemo, useState } from "react";
import * as api from "../api";
import type { AssistantPreset, HarmonySuggestionPack } from "../types";
import { useProjectStore } from "../stores/projectStore";

export function AssistantPanel() {
  const project = useProjectStore((s) => s.project);
  const load = useProjectStore((s) => s.load);

  const [keyRoot, setKeyRoot] = useState("C");
  const [scale, setScale] = useState("minor");
  const [energy, setEnergy] = useState(0.75);
  const [bars, setBars] = useState(8);
  const [harmony, setHarmony] = useState<HarmonySuggestionPack | null>(null);
  const [classifyApplyTags, setClassifyApplyTags] = useState(true);
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [presets, setPresets] = useState<AssistantPreset[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tracks = project?.tracks ?? [];
  const selectedTrack = useMemo(() => tracks.find((track) => track.id === selectedTrackId), [tracks, selectedTrackId]);

  if (!project) {
    return <p className="text-xs text-deck-text-muted">No project loaded.</p>;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs uppercase tracking-widest text-deck-cyan">AI Producer Assistant</h3>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Chord / Progression Helper</p>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <label className="text-deck-text-muted flex flex-col gap-1">
            Key
            <input
              value={keyRoot}
              onChange={(event) => setKeyRoot(event.target.value)}
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            />
          </label>
          <label className="text-deck-text-muted flex flex-col gap-1">
            Scale
            <select
              value={scale}
              onChange={(event) => setScale(event.target.value)}
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            >
              <option value="minor">Minor</option>
              <option value="major">Major</option>
            </select>
          </label>
          <label className="text-deck-text-muted flex flex-col gap-1">
            Bars
            <input
              type="number"
              min={4}
              max={32}
              step={1}
              value={bars}
              onChange={(event) => setBars(Number(event.target.value))}
              className="rounded border border-deck-border bg-deck-surface px-2 py-1"
            />
          </label>
          <label className="text-deck-text-muted flex flex-col gap-1">
            Energy
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={energy}
              onChange={(event) => setEnergy(Number(event.target.value))}
            />
          </label>
        </div>
        <button
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("harmony");
            setError(null);
            try {
              const generated = await api.assistantHarmonyGenerate({
                keyRoot,
                scale,
                energy,
                bars,
              });
              setHarmony(generated);
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(null);
            }
          }}
          className="w-full rounded border border-deck-cyan/40 bg-deck-cyan/10 text-deck-cyan text-[11px] px-2 py-1 disabled:opacity-50"
        >
          Generate Suggestions
        </button>
        {harmony && (
          <div className="space-y-1 max-h-44 overflow-auto">
            {harmony.progressions.map((prog) => (
              <div key={prog.id} className="rounded border border-deck-border p-1.5 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-deck-text">{prog.name}</span>
                  <span className="text-deck-text-muted">{prog.mood}</span>
                </div>
                <div className="text-deck-cyan">{prog.chords.join("  |  ")}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Smart Browser Classification</p>
        <label className="text-[11px] text-deck-text-muted flex items-center gap-2">
          <input
            type="checkbox"
            checked={classifyApplyTags}
            onChange={(event) => setClassifyApplyTags(event.target.checked)}
          />
          Apply suggested tags to browser index
        </label>
        <button
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("classify");
            setError(null);
            try {
              await api.assistantAssetClassify(classifyApplyTags);
              await load();
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(null);
            }
          }}
          className="w-full rounded border border-deck-magenta/40 bg-deck-magenta/10 text-deck-magenta text-[11px] px-2 py-1 disabled:opacity-50"
        >
          Analyze Imported Assets
        </button>
        <div className="space-y-1 max-h-28 overflow-auto">
          {(project.asset_classifications ?? []).slice(0, 12).map((entry) => (
            <div key={entry.asset_id} className="rounded border border-deck-border p-1.5 text-[10px]">
              <div className="flex justify-between">
                <span className="text-deck-text">{project.media.find((m) => m.id === entry.asset_id)?.name ?? entry.asset_id}</span>
                <span className="text-deck-text-muted">{entry.category}</span>
              </div>
              <div className="text-deck-cyan">{entry.suggested_tags.join(", ")}</div>
            </div>
          ))}
          {(project.asset_classifications ?? []).length === 0 && (
            <p className="text-[11px] text-deck-text-muted">No classification data yet.</p>
          )}
        </div>
      </div>

      <div className="rounded border border-deck-border bg-deck-panel p-2 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-deck-text-muted">Vocal Chain Assistant</p>
        <div className="flex gap-1">
          <select
            value={selectedTrackId}
            onChange={(event) => setSelectedTrackId(event.target.value)}
            className="flex-1 rounded border border-deck-border bg-deck-surface px-2 py-1 text-[11px]"
          >
            <option value="">Select track</option>
            {tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              setBusy("presets");
              setError(null);
              try {
                const list = await api.assistantVocalPresets();
                setPresets(list);
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(null);
              }
            }}
            className="px-2 py-1 rounded text-[11px] border border-deck-border bg-deck-muted disabled:opacity-50"
          >
            Load Presets
          </button>
        </div>
        {selectedTrack && (
          <p className="text-[10px] text-deck-text-muted">Target: {selectedTrack.name}</p>
        )}
        <div className="space-y-1 max-h-36 overflow-auto">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={!selectedTrackId || busy !== null}
              onClick={async () => {
                if (!selectedTrackId) return;
                setBusy("apply_preset");
                setError(null);
                try {
                  await api.assistantPresetApply(selectedTrackId, preset.id);
                  await load();
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(null);
                }
              }}
              className="w-full rounded border border-deck-border bg-deck-surface hover:border-deck-cyan/40 text-left p-1.5 text-[10px] disabled:opacity-50"
            >
              <div className="text-deck-text">{preset.name}</div>
              <div className="text-deck-text-muted">{preset.description}</div>
            </button>
          ))}
          {presets.length === 0 && <p className="text-[11px] text-deck-text-muted">Load presets to begin.</p>}
        </div>
      </div>

      {error && <p className="text-[11px] text-red-300">{error}</p>}
    </div>
  );
}
