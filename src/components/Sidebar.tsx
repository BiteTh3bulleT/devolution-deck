import { useCallback, useMemo, useState } from "react";
import * as api from "../api";
import { useBrowserStore } from "../stores/browserStore";
import { useProjectStore } from "../stores/projectStore";
import { useSessionStore } from "../stores/sessionStore";

const TRACK_COLOR: Record<string, string> = {
  audio: "text-deck-cyan",
  midi: "text-deck-magenta",
};

export function Sidebar() {
  const tauriRuntime = api.isTauriRuntime();
  const project = useProjectStore((s) => s.project);
  const load = useProjectStore((s) => s.load);
  const query = useBrowserStore((s) => s.query);
  const selectedTagIds = useBrowserStore((s) => s.selectedTagIds);
  const setQuery = useBrowserStore((s) => s.setQuery);
  const toggleTagFilter = useBrowserStore((s) => s.toggleTagFilter);
  const addTag = useBrowserStore((s) => s.addTag);
  const toggleAssetTag = useBrowserStore((s) => s.toggleAssetTag);
  const toggleFavorite = useBrowserStore((s) => s.toggleFavorite);
  const filteredAssets = useBrowserStore((s) => s.filteredAssets);
  const selectedSceneId = useSessionStore((s) => s.selectedSceneId);
  const createAudioCellFromAsset = useSessionStore((s) => s.createAudioCellFromAsset);

  const [newTagLabel, setNewTagLabel] = useState("");

  const handleAddTrack = useCallback(
    async (type: "audio" | "midi" = "audio") => {
      try {
        await api.trackAdd("", type);
        await load();
      } catch (e) {
        console.error("Add track failed", e);
      }
    },
    [load]
  );

  const tracks = project?.tracks ?? [];
  const tags = project?.browser_index.tags ?? [];
  const browserAssets = useMemo(
    () => (project ? filteredAssets(project) : []),
    [filteredAssets, project]
  );
  const assetIndex = new Map(
    (project?.browser_index.assets ?? []).map((entry) => [entry.asset_id, entry])
  );
  const firstAudioTrack = tracks.find((track) => track.track_type === "audio");
  const classifiedCategories = Array.from(
    new Set((project?.asset_classifications ?? []).map((entry) => entry.category))
  );

  return (
    <aside className="w-[280px] shrink-0 flex flex-col bg-deck-surface border-r border-deck-border overflow-hidden">
      <div className="p-2 border-b border-deck-border space-y-2">
        <h2 className="text-xs font-display font-semibold uppercase tracking-wider text-deck-text-muted">
          Browser
        </h2>
        <input
          value={query}
          onChange={(event) => void setQuery(event.target.value)}
          placeholder="Search samples..."
          className="w-full rounded border border-deck-border bg-deck-panel px-2 py-1 text-xs"
        />
        <div className="flex gap-1 flex-wrap">
          {tags.map((tag) => {
            const active = selectedTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => void toggleTagFilter(tag.id)}
                className={[
                  "px-2 py-0.5 rounded text-[10px] border",
                  active
                    ? "bg-deck-cyan/15 border-deck-cyan/40 text-deck-cyan"
                    : "bg-deck-muted border-deck-border text-deck-text-muted",
                ].join(" ")}
              >
                {tag.label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-1">
          <input
            value={newTagLabel}
            onChange={(event) => setNewTagLabel(event.target.value)}
            placeholder="new tag"
            className="flex-1 rounded border border-deck-border bg-deck-panel px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={async () => {
              const label = newTagLabel.trim();
              if (!label) return;
              await addTag(label);
              setNewTagLabel("");
            }}
            disabled={!newTagLabel.trim()}
            className="px-2 py-1 rounded text-xs bg-deck-muted hover:bg-deck-graphite disabled:opacity-50"
          >
            Add
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!tauriRuntime) return;
              try {
                await api.assistantAssetClassify(true);
                await load();
              } catch (error) {
                console.error("AI tag failed", error);
              }
            }}
            disabled={!tauriRuntime}
            className="px-2 py-1 rounded text-xs bg-deck-cyan/10 text-deck-cyan border border-deck-cyan/30"
            title="Analyze imported assets and apply smart tags"
          >
            AI Tag
          </button>
        </div>
        {classifiedCategories.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {classifiedCategories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={async () => {
                  const tag = project?.browser_index.tags.find((entry) => entry.label === category);
                  if (tag) {
                    await toggleTagFilter(tag.id);
                  }
                }}
                className="px-1.5 py-0.5 rounded border border-deck-border text-[9px] text-deck-text-muted"
              >
                {category}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {browserAssets.length === 0 ? (
          <p className="text-xs text-deck-text-muted">No media matches current filters.</p>
        ) : (
          browserAssets.map((asset) => {
            const entry = assetIndex.get(asset.id);
            const favorite = entry?.favorite ?? false;
            return (
              <div
                key={asset.id}
                className="px-2 py-1.5 rounded text-sm bg-deck-panel/60 hover:bg-deck-muted/40 border border-transparent hover:border-deck-border"
                title={`${asset.name} · ${asset.duration_secs.toFixed(1)}s`}
              >
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void toggleFavorite(asset.id)}
                    className={[
                      "text-[11px] w-4",
                      favorite ? "text-deck-amber" : "text-deck-text-muted/50",
                    ].join(" ")}
                  >
                    ★
                  </button>
                  <span className="truncate flex-1 text-xs">{asset.name}</span>
                  {selectedSceneId && firstAudioTrack && (
                    <button
                      type="button"
                      onClick={() =>
                        void createAudioCellFromAsset(firstAudioTrack.id, selectedSceneId, asset.id)
                      }
                      className="text-[10px] px-1.5 py-0.5 rounded border border-deck-cyan/40 text-deck-cyan"
                    >
                      Cell
                    </button>
                  )}
                </div>
                <div className="mt-1 flex gap-1 flex-wrap">
                  {tags.map((tag) => {
                    const active = entry?.tag_ids.includes(tag.id) ?? false;
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => void toggleAssetTag(asset.id, tag.id)}
                        className={[
                          "text-[9px] px-1.5 py-0.5 rounded border",
                          active
                            ? "border-deck-magenta/50 text-deck-magenta bg-deck-magenta/10"
                            : "border-deck-border text-deck-text-muted/70",
                        ].join(" ")}
                      >
                        {tag.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="p-2 border-t border-deck-border space-y-1">
        <h2 className="text-xs font-display font-semibold uppercase tracking-wider text-deck-text-muted mb-1.5">
          Tracks
        </h2>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => void handleAddTrack("audio")}
            className="flex-1 px-2 py-1.5 rounded text-xs bg-deck-cyan/10 hover:bg-deck-cyan/20 text-deck-cyan border border-deck-cyan/20"
          >
            + Audio
          </button>
          <button
            type="button"
            onClick={() => void handleAddTrack("midi")}
            className="flex-1 px-2 py-1.5 rounded text-xs bg-deck-magenta/10 hover:bg-deck-magenta/20 text-deck-magenta border border-deck-magenta/20"
          >
            + MIDI
          </button>
        </div>
        {tracks.map((track) => (
          <div key={track.id} className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-deck-panel/50">
            <span
              className={`text-[8px] font-mono font-bold uppercase shrink-0 ${TRACK_COLOR[track.track_type] ?? "text-deck-text-muted"}`}
            >
              {track.track_type === "midi" ? "M" : "A"}
            </span>
            <span className="text-xs text-deck-text-muted truncate">{track.name}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
