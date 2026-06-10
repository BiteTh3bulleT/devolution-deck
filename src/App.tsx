import { useEffect } from "react";
import * as api from "./api";
import { DrumSequencer } from "./components/DrumSequencer/DrumSequencer";
import { AppStatusStrip } from "./components/AppStatusStrip";
import { DeckPerformanceView } from "./components/DeckPerformanceView";
import { PerformanceModeView } from "./components/PerformanceModeView";
import { PianoRoll } from "./components/PianoRoll/PianoRoll";
import { SessionLauncher } from "./components/SessionLauncher";
import { Sidebar } from "./components/Sidebar";
import { Timeline } from "./components/Timeline";
import { TransportBar } from "./components/TransportBar";
import { UtilityPanel } from "./components/UtilityPanel";
import { metronomeService } from "./services/metronome";
import { midiSequencer } from "./services/midiSequencer";
import { useArrangementStore } from "./stores/arrangementStore";
import { useBrowserStore } from "./stores/browserStore";
import { useLoopStore } from "./stores/loopStore";
import { useMetronomeStore } from "./stores/metronomeStore";
import { useMidiStore } from "./stores/midiStore";
import { useProjectStore } from "./stores/projectStore";
import { useSessionStore } from "./stores/sessionStore";
import { useShortcutStore } from "./stores/shortcutStore";
import { useTransportStore } from "./stores/transportStore";
import { useViewStore } from "./stores/viewStore";

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName.toLowerCase();
  return (
    element.isContentEditable ||
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    tag === "button"
  );
}

function isKnownMainView(
  value: string
): value is "arrangement" | "session" | "decks" | "performance" {
  return value === "arrangement" || value === "session" || value === "decks" || value === "performance";
}

function isKnownUtilityTab(value: string): boolean {
  return [
    "inspector",
    "mixer",
    "automation",
    "templates",
    "plugins",
    "render",
    "comping",
    "system",
    "shortcuts",
    "assistant",
    "dashboard",
    "performance",
    "show",
    "branding",
    "ops",
  ].includes(value);
}

export default function App() {
  const tauriRuntime = api.isTauriRuntime();
  const load = useProjectStore((s) => s.load);
  const syncFromProject = useLoopStore((s) => s.syncFromProject);
  const project = useProjectStore((s) => s.project);
  const openClip = useMidiStore((s) => s.openClip);
  const openDrumTrack = useMidiStore((s) => s.openDrumTrack);
  const closeDrumSequencer = useMidiStore((s) => s.closeDrumSequencer);
  const mainView = useViewStore((s) => s.mainView);
  const setMainView = useViewStore((s) => s.setMainView);
  const setUtilityTab = useViewStore((s) => s.setUtilityTab);
  const ensureSessionDefaults = useSessionStore((s) => s.ensureDefaults);
  const hydrateFromProject = useBrowserStore((s) => s.hydrateFromProject);
  const hydrateShortcuts = useShortcutStore((s) => s.hydrateFromProject);
  const ensureShortcutDefaults = useShortcutStore((s) => s.ensureDefaultsPersisted);
  const matchShortcutAction = useShortcutStore((s) => s.matchActionFromEvent);

  useEffect(() => {
    if (!tauriRuntime) return;
    void load();
  }, [load, tauriRuntime]);

  useEffect(() => {
    if (!tauriRuntime) return;
    if (project) {
      syncFromProject(project.loop_region);
      void ensureSessionDefaults();
      void ensureShortcutDefaults(project);
      if (project.navigation?.main_view) {
        const nextView = project.navigation.main_view;
        if (isKnownMainView(nextView) && nextView !== mainView) {
          setMainView(nextView);
        }
      }
      if (project.navigation?.utility_tab && isKnownUtilityTab(project.navigation.utility_tab)) {
        setUtilityTab(project.navigation.utility_tab as Parameters<typeof setUtilityTab>[0]);
      }
    }
    hydrateFromProject(project);
    hydrateShortcuts(project);
  }, [
    project,
    syncFromProject,
    ensureSessionDefaults,
    hydrateFromProject,
    hydrateShortcuts,
    ensureShortcutDefaults,
    mainView,
    setMainView,
    setUtilityTab,
    tauriRuntime,
  ]);

  useEffect(() => {
    if (!tauriRuntime) return;
    let lastLogUnixMs = 0;
    const minLogSpacingMs = 1_000;
    const tryLogError = async (source: string, message: string, context?: string) => {
      const now = Date.now();
      if (now - lastLogUnixMs < minLogSpacingMs) return;
      lastLogUnixMs = now;
      try {
        await api.errorReportAdd({
          source,
          message: message.slice(0, 500),
          severity: "error",
          context: context?.slice(0, 500),
        });
      } catch {
        // Ignore logging failures to avoid recursive error loops.
      }
    };

    const onError = (event: ErrorEvent) => {
      void tryLogError(
        "window_error",
        event.message || "Unknown window error",
        `${event.filename}:${event.lineno}:${event.colno}`
      );
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason =
        event.reason instanceof Error ? event.reason.message : typeof event.reason === "string" ? event.reason : JSON.stringify(event.reason);
      void tryLogError("promise_rejection", reason || "Unhandled promise rejection");
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [tauriRuntime]);

  useEffect(() => {
    if (!tauriRuntime) return;
    if (!project) return;
    const intervalSecs = Math.max(10, project.autosave_interval_secs || 60);
    const timerId = window.setInterval(() => {
      void api.recoverySnapshotSave("autosave");
    }, intervalSecs * 1000);
    return () => window.clearInterval(timerId);
  }, [project?.autosave_interval_secs, project, tauriRuntime]);

  useEffect(() => {
    const root = document.documentElement;
    if (!project) return;
    const theme = project.branding.theme;
    root.style.setProperty("--deck-bg", theme.bg_hex);
    root.style.setProperty("--deck-surface", theme.surface_hex);
    root.style.setProperty("--deck-panel", theme.panel_hex);
    root.style.setProperty("--deck-border", theme.border_hex);
    root.style.setProperty("--deck-text", theme.text_hex);
    root.style.setProperty("--deck-text-muted", theme.text_muted_hex);
    root.style.setProperty("--deck-accent", theme.accent_hex);
    root.style.setProperty("--deck-cyan", theme.cyan_hex);
    root.style.setProperty("--deck-magenta", theme.magenta_hex);
    root.style.setProperty("--deck-amber", theme.amber_hex);
    root.style.setProperty("--devo-brand", project.branding.brand_name);
    root.style.setProperty("--devo-artist", project.branding.artist_name);
  }, [project?.branding, project]);

  useEffect(() => {
    if (!tauriRuntime) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTypingTarget(event.target)) {
        return;
      }
      const action = matchShortcutAction(event);
      if (!action) return;
      event.preventDefault();

      void (async () => {
        switch (action) {
          case "transport_play_stop": {
            const transport = useTransportStore.getState();
            if (transport.status === "playing") {
              await transport.stop();
              metronomeService.stop();
              midiSequencer.stop();
              return;
            }
            const currentProject = useProjectStore.getState().project;
            if (!currentProject) return;

            const clips = currentProject.tracks
              .flatMap((track) => track.clips)
              .sort((a, b) => a.start_secs - b.start_secs);
            const firstClip = clips[0];
            if (!firstClip) return;

            const asset = currentProject.media.find((media) => media.id === firstClip.media_asset_id);
            if (!asset) return;

            await transport.play({
              path: asset.path,
              offset_secs: firstClip.source_offset_secs,
              duration_secs: firstClip.duration_secs,
            });

            if (useMetronomeStore.getState().enabled) {
              metronomeService.setEnabled(true);
              metronomeService.start(transport.positionSecs, currentProject.bpm);
            }

            const midiClips = currentProject.tracks.flatMap((track) =>
              track.midi_clips.map((clip) => ({ clip, trackStartSecs: clip.start_secs }))
            );
            midiSequencer.start(transport.positionSecs, currentProject.bpm, midiClips);
            return;
          }

          case "transport_stop": {
            await useTransportStore.getState().stop();
            metronomeService.stop();
            midiSequencer.stop();
            return;
          }

          case "transport_to_start": {
            await api.playbackSeek(0);
            useTransportStore.getState().setPositionSecs(0);
            return;
          }

          case "project_save": {
            const projectState = useProjectStore.getState();
            if (projectState.projectPath) {
              await projectState.save();
            }
            return;
          }

          case "track_add_audio": {
            await api.trackAdd("", "audio");
            await useProjectStore.getState().load();
            return;
          }

          case "track_add_midi": {
            await api.trackAdd("", "midi");
            await useProjectStore.getState().load();
            return;
          }

          case "view_arrangement": {
            useViewStore.getState().setMainView("arrangement");
            return;
          }

          case "view_session": {
            useViewStore.getState().setMainView("session");
            return;
          }

          case "view_decks": {
            useViewStore.getState().setMainView("decks");
            return;
          }

          case "view_performance": {
            useViewStore.getState().setMainView("performance");
            return;
          }

          case "utility_mixer": {
            useViewStore.getState().setUtilityTab("mixer");
            return;
          }

          case "utility_plugins": {
            useViewStore.getState().setUtilityTab("plugins");
            return;
          }

          case "utility_render": {
            useViewStore.getState().setUtilityTab("render");
            return;
          }

          case "utility_dashboard": {
            useViewStore.getState().setUtilityTab("dashboard");
            return;
          }

          case "utility_ops": {
            useViewStore.getState().setUtilityTab("ops");
            return;
          }

          case "timeline_zoom_in": {
            useViewStore.getState().zoomIn();
            return;
          }

          case "timeline_zoom_out": {
            useViewStore.getState().zoomOut();
            return;
          }

          case "clip_delete_selected": {
            const selection = useArrangementStore.getState().selectedAudioClip;
            const currentProject = useProjectStore.getState().project;
            if (!selection || !currentProject) return;

            const updatedProject = {
              ...currentProject,
              tracks: currentProject.tracks.map((track) =>
                track.id === selection.trackId
                  ? {
                      ...track,
                      clips: track.clips.filter((clip) => clip.id !== selection.clipId),
                    }
                  : track
              ),
            };
            await api.projectUpdate(updatedProject);
            useArrangementStore.getState().clearAudioClipSelection();
            await useProjectStore.getState().load();
            return;
          }

          default:
            return;
        }
      })();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [matchShortcutAction, tauriRuntime]);

  if (!tauriRuntime) {
    return (
      <div className="flex items-center justify-center h-full bg-deck-bg text-deck-text p-6">
        <div className="max-w-xl w-full rounded border border-deck-border bg-deck-panel p-6 space-y-3">
          <h1 className="font-display text-lg text-deck-accent">DEVOLUTION//DECK Desktop Runtime Required</h1>
          <p className="text-sm text-deck-text-muted">
            This UI is running in browser-only mode (`localhost:5173`), so Tauri commands are unavailable.
          </p>
          <p className="text-sm text-deck-text-muted">
            Start with <code>npm run tauri dev</code> to use transport, file dialogs, audio, persistence, and assistant features.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-deck-bg text-deck-text font-sans">
      <TransportBar />
      <AppStatusStrip />
      <div className="flex flex-1 min-h-0 relative">
        <Sidebar />
        <div className="flex flex-1 flex-col min-w-0 relative">
          {mainView === "arrangement" && <Timeline />}
          {mainView === "session" && <SessionLauncher />}
          {mainView === "decks" && <DeckPerformanceView />}
          {mainView === "performance" && <PerformanceModeView />}
          {openClip && <PianoRoll />}
          {openDrumTrack && <DrumSequencer track={openDrumTrack} onClose={closeDrumSequencer} />}
        </div>
        <UtilityPanel />
      </div>
    </div>
  );
}
