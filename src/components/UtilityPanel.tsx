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
  const activeShellClass = utilityTab === "mixer" ? "" : `devooo-${utilityTab}-shell`;

  const selectTab = (tabId: typeof utilityTab) => {
    setUtilityTab(tabId);
    if (!project) return;
    void api
      .navigationUpdate({
        ...project.navigation,
        utility_tab: tabId,
      })
      .then((navigation) => {
        const current = useProjectStore.getState().project;
        if (!current || current.id !== project.id) return;
        setProject({
          ...current,
          navigation,
        });
      })
      .catch((error) => {
        console.error("Failed to persist utility tab selection", error);
      });
  };

  return (
    <aside className="deck-utility w-[320px] xl:w-[360px] shrink-0 flex flex-col bg-deck-surface border-l border-deck-border overflow-hidden">
      <div className="deck-utility-header">
        <div><span className="deck-module-title">Control rack</span><span>{String(TABS.findIndex(t => t.id === utilityTab) + 1).padStart(2, "0")} / 15</span></div>
        <select aria-label="Control rack module" value={utilityTab} onChange={e => selectTab(e.target.value as typeof utilityTab)}>
          {TABS.map(tab => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
        </select>
      </div>

      <div
        className={[
          "devooo-utility-tab-content flex-1 overflow-y-auto p-3 space-y-4 text-sm text-deck-text-muted",
          activeShellClass,
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
