import * as api from "../api";
import { AutomationPanel } from "./AutomationPanel";
import { AssistantPanel } from "./AssistantPanel";
import { BrandingPanel } from "./BrandingPanel";
import { CompingPanel } from "./CompingPanel";
import { DashboardPanel } from "./DashboardPanel";
import { InstrumentPanel } from "./InstrumentPanel";
import { MixerPanel } from "./MixerPanel";
import { PerformancePanel } from "./PerformancePanel";
import { PluginPanel } from "./PluginPanel";
import { RenderPanel } from "./RenderPanel";
import { ReleaseOpsPanel } from "./ReleaseOpsPanel";
import { ShowControlPanel } from "./ShowControlPanel";
import { ShortcutsPanel } from "./ShortcutsPanel";
import { SystemPanel } from "./SystemPanel";
import { TemplatePanel } from "./TemplatePanel";
import { WarpSlicingPanel } from "./WarpSlicingPanel";
import { useProjectStore } from "../stores/projectStore";
import { useViewStore } from "../stores/viewStore";

const TABS = [
  { id: "inspector", label: "Inspector" },
  { id: "mixer", label: "Mixer" },
  { id: "plugins", label: "Plugins" },
  { id: "automation", label: "Automation" },
  { id: "render", label: "Render" },
  { id: "comping", label: "Comping" },
  { id: "system", label: "System" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "assistant", label: "Assistant" },
  { id: "dashboard", label: "Dashboard" },
  { id: "performance", label: "Performance" },
  { id: "show", label: "Show" },
  { id: "ops", label: "Ops" },
  { id: "branding", label: "Branding" },
  { id: "templates", label: "Templates" },
] as const;

export function UtilityPanel() {
  const project = useProjectStore((s) => s.project);
  const setProject = useProjectStore((s) => s.setProject);
  const utilityTab = useViewStore((s) => s.utilityTab);
  const setUtilityTab = useViewStore((s) => s.setUtilityTab);
  const midiTracks = project?.tracks.filter((track) => track.track_type === "midi") ?? [];

  const selectTab = (tabId: typeof utilityTab) => {
    setUtilityTab(tabId);
    if (!project) return;
    void api
      .navigationUpdate({
        ...project.navigation,
        utility_tab: tabId,
      })
      .then((navigation) => {
        setProject({
          ...project,
          navigation,
        });
      })
      .catch((error) => {
        console.error("Failed to persist utility tab selection", error);
      });
  };

  return (
    <aside className="w-[340px] shrink-0 flex flex-col bg-deck-surface border-l border-deck-border overflow-hidden">
      <div className="p-2 border-b border-deck-border">
        <div className="flex flex-wrap items-center gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              className={[
                "devooo-utility-tab px-2 py-1 text-[11px] transition-colors",
                utilityTab === tab.id
                  ? "devooo-utility-tab-active text-deck-cyan"
                  : "devooo-utility-tab-inactive text-deck-text-muted",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={[
          "flex-1 overflow-y-auto p-3 space-y-4 text-sm text-deck-text-muted",
          utilityTab === "inspector" ? "devooo-inspector-shell devooo-inspector-skinned" : "",
        ].join(" ")}
      >
        {utilityTab === "inspector" && (
          <>
            {project ? (
              <>
                <div className="devooo-inspector-section-card p-4">
                  <dl className="space-y-1.5">
                    <div className="devooo-inspector-stat-row flex items-center justify-between px-3">
                      <dt className="text-deck-text-muted/70 text-xs">Project</dt>
                      <dd className="text-deck-text font-medium text-xs truncate ml-2">{project.title}</dd>
                    </div>
                    <div className="devooo-inspector-stat-row flex items-center justify-between px-3">
                      <dt className="text-deck-text-muted/70 text-xs">BPM</dt>
                      <dd className="tabular-nums text-xs text-deck-amber">{project.bpm}</dd>
                    </div>
                    <div className="devooo-inspector-stat-row flex items-center justify-between px-3">
                      <dt className="text-deck-text-muted/70 text-xs">Tracks</dt>
                      <dd className="text-xs">{project.tracks.length}</dd>
                    </div>
                    <div className="devooo-inspector-stat-row flex items-center justify-between px-3">
                      <dt className="text-deck-text-muted/70 text-xs">Scenes</dt>
                      <dd className="text-xs">{project.session.scenes.length}</dd>
                    </div>
                    <div className="devooo-inspector-stat-row flex items-center justify-between px-3">
                      <dt className="text-deck-text-muted/70 text-xs">Automation Lanes</dt>
                      <dd className="text-xs">{project.automation_lanes.length}</dd>
                    </div>
                  </dl>
                </div>
                {midiTracks.map((track) => (
                  <div key={track.id} className="devooo-instrument-assignment-card p-4">
                    <p className="text-[10px] font-mono text-deck-magenta mb-2 uppercase tracking-wide">
                      {track.name}
                    </p>
                    <InstrumentPanel track={track} />
                  </div>
                ))}
                <div className="devooo-warp-slicing-card p-4">
                  <WarpSlicingPanel />
                </div>
              </>
            ) : (
              <div className="devooo-empty-state-card flex items-center px-4">
                <p className="text-deck-text-muted/80 text-xs">No project loaded.</p>
              </div>
            )}
          </>
        )}

        {utilityTab === "mixer" && <MixerPanel />}
        {utilityTab === "plugins" && <PluginPanel />}
        {utilityTab === "automation" && <AutomationPanel />}
        {utilityTab === "render" && <RenderPanel />}
        {utilityTab === "comping" && <CompingPanel />}
        {utilityTab === "system" && <SystemPanel />}
        {utilityTab === "shortcuts" && <ShortcutsPanel />}
        {utilityTab === "assistant" && <AssistantPanel />}
        {utilityTab === "dashboard" && <DashboardPanel />}
        {utilityTab === "performance" && <PerformancePanel />}
        {utilityTab === "show" && <ShowControlPanel />}
        {utilityTab === "ops" && <ReleaseOpsPanel />}
        {utilityTab === "branding" && <BrandingPanel />}
        {utilityTab === "templates" && <TemplatePanel />}
      </div>
    </aside>
  );
}
