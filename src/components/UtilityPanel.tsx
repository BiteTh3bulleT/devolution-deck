import { useProjectStore } from "../stores/projectStore";

export function UtilityPanel() {
  const project = useProjectStore((s) => s.project);

  return (
    <aside className="w-64 shrink-0 flex flex-col bg-deck-surface border-l border-deck-border overflow-hidden">
      <div className="p-2 border-b border-deck-border">
        <h2 className="text-xs font-display font-semibold uppercase tracking-wider text-deck-text-muted">
          Inspector
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto p-3 text-sm text-deck-text-muted">
        {project ? (
          <dl className="space-y-2">
            <div>
              <dt className="text-deck-text-muted/80">Project</dt>
              <dd className="text-deck-text font-medium">{project.title}</dd>
            </div>
            <div>
              <dt className="text-deck-text-muted/80">BPM</dt>
              <dd className="tabular-nums">{project.bpm}</dd>
            </div>
            <div>
              <dt className="text-deck-text-muted/80">Tracks</dt>
              <dd>{project.tracks.length}</dd>
            </div>
            <div>
              <dt className="text-deck-text-muted/80">Media</dt>
              <dd>{project.media.length}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-deck-text-muted/80">No project loaded.</p>
        )}
        <p className="mt-4 text-xs text-deck-text-muted/60">
          Clip details and future mixer/editor will appear here.
        </p>
      </div>
    </aside>
  );
}
