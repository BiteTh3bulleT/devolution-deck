import * as api from "../api";
import { EDM_TEMPLATES } from "../data/templates";
import { applyTemplateToProject } from "../services/templateService";
import { useProjectStore } from "../stores/projectStore";

export function TemplatePanel() {
  const project = useProjectStore((s) => s.project);
  const load = useProjectStore((s) => s.load);

  if (!project) {
    return <p className="text-xs text-deck-text-muted">No project loaded.</p>;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs uppercase tracking-widest text-deck-cyan">EDM Templates</h3>
      <p className="text-[11px] text-deck-text-muted">
        Templates replace arrangement/routing/session setup and keep imported media indexed.
      </p>
      {EDM_TEMPLATES.map((template) => (
        <button
          key={template.id}
          type="button"
          onClick={async () => {
            const updated = applyTemplateToProject(project, template);
            await api.projectUpdate(updated);
            await load();
          }}
          className="w-full rounded border border-deck-border bg-deck-panel hover:border-deck-cyan/40 text-left p-2 transition-colors"
        >
          <p className="text-xs text-deck-text">{template.name}</p>
          <p className="text-[10px] text-deck-text-muted mt-0.5">
            {template.genre} · {template.bpm} BPM · {template.tracks.length} tracks
          </p>
          <p className="text-[10px] text-deck-text-muted/80 mt-1">{template.description}</p>
        </button>
      ))}
    </div>
  );
}
