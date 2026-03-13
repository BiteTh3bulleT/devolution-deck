import { useProjectStore } from "../stores/projectStore";
import { useCallback } from "react";
import * as api from "../api";

export function Sidebar() {
  const project = useProjectStore((s) => s.project);
  const load = useProjectStore((s) => s.load);

  const handleAddTrack = useCallback(async () => {
    try {
      await api.trackAdd("");
      await load();
    } catch (e) {
      console.error("Add track failed", e);
    }
  }, [load]);

  const media = project?.media ?? [];
  const tracks = project?.tracks ?? [];

  return (
    <aside className="w-[200px] shrink-0 flex flex-col bg-deck-surface border-r border-deck-border overflow-hidden">
      <div className="p-2 border-b border-deck-border">
        <h2 className="text-xs font-display font-semibold uppercase tracking-wider text-deck-text-muted">
          Media
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {media.length === 0 ? (
          <p className="text-xs text-deck-text-muted">Import audio to see files</p>
        ) : (
          media.map((asset) => (
            <div
              key={asset.id}
              className="px-2 py-1.5 rounded text-sm truncate bg-deck-panel/50 hover:bg-deck-muted/50 cursor-default"
              title={`${asset.name} · ${asset.duration_secs.toFixed(1)}s`}
            >
              {asset.name}
            </div>
          ))
        )}
      </div>
      <div className="p-2 border-t border-deck-border">
        <h2 className="text-xs font-display font-semibold uppercase tracking-wider text-deck-text-muted mb-2">
          Tracks
        </h2>
        <button
          type="button"
          onClick={handleAddTrack}
          className="w-full px-3 py-2 rounded text-sm bg-deck-accent/20 hover:bg-deck-accent/30 text-deck-cyan"
        >
          + Add track
        </button>
        {tracks.map((t) => (
          <div key={t.id} className="mt-1 px-2 py-1 text-sm text-deck-text-muted truncate">
            {t.name}
          </div>
        ))}
      </div>
    </aside>
  );
}
