import { useMemo, useState } from "react";
import * as api from "../api";
import { useProjectStore } from "../stores/projectStore";
import { useViewStore } from "../stores/viewStore";
import type { AppMode } from "../types";

const MODE_LABELS: Record<AppMode, string> = {
  studio: "Studio",
  deck: "Deck",
  show: "Show",
  hybrid: "Hybrid",
};

function modeMainView(mode: AppMode): "arrangement" | "session" | "decks" | "performance" {
  switch (mode) {
    case "studio":
      return "arrangement";
    case "deck":
      return "decks";
    case "show":
      return "performance";
    case "hybrid":
      return "session";
    default:
      return "arrangement";
  }
}

export function AppStatusStrip() {
  const project = useProjectStore((state) => state.project);
  const load = useProjectStore((state) => state.load);
  const setMainView = useViewStore((state) => state.setMainView);
  const setUtilityTab = useViewStore((state) => state.setUtilityTab);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeMode = project?.navigation.active_mode ?? "studio";
  const indicators = project?.system_health.status_indicators ?? [];

  const header = useMemo(() => {
    if (!project) return "No project";
    return `${project.title} · schema v${project.version}`;
  }, [project]);

  if (!project) {
    return null;
  }

  return (
    <div className="h-8 border-b border-deck-border bg-deck-surface px-3 flex items-center gap-2 text-[11px]">
      <span className="text-deck-text-muted">{header}</span>
      <div className="w-px h-4 bg-deck-border" />

      <div className="flex items-center gap-1">
        {(Object.keys(MODE_LABELS) as AppMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api.navigationUpdate({
                  ...project.navigation,
                  active_mode: mode,
                  main_view: modeMainView(mode),
                });
                setMainView(modeMainView(mode));
                await load();
              } catch (modeError) {
                setError(modeError instanceof Error ? modeError.message : String(modeError));
              } finally {
                setBusy(false);
              }
            }}
            className={[
              "px-2 py-0.5 rounded border",
              activeMode === mode
                ? "border-deck-cyan/40 bg-deck-cyan/10 text-deck-cyan"
                : "border-deck-border bg-deck-muted text-deck-text-muted",
            ].join(" ")}
          >
            {MODE_LABELS[mode]}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-1">
        {indicators.slice(0, 4).map((indicator) => (
          <span
            key={indicator.id}
            title={indicator.detail}
            className={[
              "px-1.5 py-0.5 rounded border text-[10px]",
              indicator.level === "ok"
                ? "border-deck-cyan/40 text-deck-cyan"
                : indicator.level === "warn"
                  ? "border-deck-amber/40 text-deck-amber"
                  : "border-red-400/50 text-red-300",
            ].join(" ")}
          >
            {indicator.label}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setUtilityTab("ops")}
          className="px-2 py-0.5 rounded border border-deck-magenta/40 text-deck-magenta"
        >
          Ops
        </button>
      </div>

      {error && <span className="text-red-300 truncate max-w-64">{error}</span>}
    </div>
  );
}
