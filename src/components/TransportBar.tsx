import { useProjectStore } from "../stores/projectStore";
import { useTransportStore } from "../stores/transportStore";
import { useLoopStore } from "../stores/loopStore";
import { useMetronomeStore } from "../stores/metronomeStore";
import { metronomeService } from "../services/metronome";
import { midiSequencer } from "../services/midiSequencer";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { useEffect } from "react";
import * as api from "../api";
import { MetronomeWidget } from "./MetronomeWidget";
import { RecordButton } from "./RecordButton";
import { useViewStore } from "../stores/viewStore";
import type { DeckMainView } from "../stores/viewStore";

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const ms = Math.floor((secs % 1) * 100);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

export function TransportBar() {
  const tauriRuntime = api.isTauriRuntime();
  const project = useProjectStore((s) => s.project);
  const projectPath = useProjectStore((s) => s.projectPath);
  const newProject = useProjectStore((s) => s.newProject);
  const open = useProjectStore((s) => s.open);
  const save = useProjectStore((s) => s.save);
  const error = useProjectStore((s) => s.error);
  const clearError = useProjectStore((s) => s.clearError);

  const status = useTransportStore((s) => s.status);
  const positionSecs = useTransportStore((s) => s.positionSecs);
  const play = useTransportStore((s) => s.play);
  const stop = useTransportStore((s) => s.stop);

  const loopRegion = useLoopStore((s) => s.region);
  const setLoopRegion = useLoopStore((s) => s.setRegion);
  const clearLoopRegion = useLoopStore((s) => s.clearRegion);
  const metronomeEnabled = useMetronomeStore((s) => s.enabled);
  const mainView = useViewStore((s) => s.mainView);
  const setMainView = useViewStore((s) => s.setMainView);

  const persistMainView = (view: DeckMainView) => {
    setMainView(view);
    if (!project) return;
    void api
      .navigationUpdate({
        ...project.navigation,
        main_view: view,
      })
      .then((navigation) => {
        const current = useProjectStore.getState().project;
        if (!current) return;
        useProjectStore.getState().setProject({
          ...current,
          navigation,
        });
      })
      .catch(() => undefined);
  };

  const handleNew = async () => {
    await newProject();
  };

  const handleOpen = async () => {
    if (!tauriRuntime) return;
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: "DevoDeck Project", extensions: ["deck"] }],
      });
      if (selected) await open(selected);
    } catch (openError) {
      console.error("Open project failed", openError);
      await api.errorReportAdd({
        source: "project_open",
        message: openError instanceof Error ? openError.message : String(openError),
        severity: "error",
      }).catch(() => undefined);
    }
  };

  const handleSave = async () => {
    if (!tauriRuntime) return;
    try {
      if (projectPath) {
        await save();
        return;
      }
      const selected = await saveDialog({
        defaultPath: project?.title ? `${project.title}.deck` : "untitled.deck",
        filters: [{ name: "DevoDeck Project", extensions: ["deck"] }],
      });
      if (selected) await save(selected);
    } catch (saveError) {
      console.error("Save project failed", saveError);
      await api.errorReportAdd({
        source: "project_save",
        message: saveError instanceof Error ? saveError.message : String(saveError),
        severity: "error",
      }).catch(() => undefined);
    }
  };

  const handleImport = async () => {
    if (!tauriRuntime) return;
    try {
      const selected = await openDialog({
        multiple: true,
        filters: [
          { name: "Audio", extensions: ["wav", "mp3", "flac", "ogg", "m4a", "aac"] },
        ],
      });
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        let proj = useProjectStore.getState().project;
        if (!proj) return;
        for (const p of paths) {
          try {
            const asset = await api.mediaImportAudio(p);
            proj = await api.projectGet();
            if (!proj) continue;
            let tracks = proj.tracks;
            if (tracks.length === 0) {
              await api.trackAdd("Track 1");
              proj = await api.projectGet();
              tracks = proj?.tracks ?? [];
            }
            if (tracks.length > 0) {
              const lastStart = tracks[0].clips.reduce(
                (max, c) => Math.max(max, c.start_secs + c.duration_secs),
                0
              );
              await api.clipPlace({
                media_asset_id: asset.id,
                track_index: 0,
                start_secs: lastStart,
                source_offset_secs: 0,
                duration_secs: asset.duration_secs,
              });
              proj = await api.projectGet();
            }
          } catch (e) {
            console.error("Import failed", p, e);
          }
        }
        useProjectStore.getState().load();
      }
    } catch (importError) {
      console.error("Import dialog failed", importError);
      await api.errorReportAdd({
        source: "media_import",
        message: importError instanceof Error ? importError.message : String(importError),
        severity: "error",
      }).catch(() => undefined);
    }
  };

  const handlePlay = async () => {
    if (!tauriRuntime) return;
    if (!project) return;
    const allClips = project.tracks.flatMap((t) => t.clips);
    const firstClip = [...allClips].sort((a, b) => a.start_secs - b.start_secs)[0];
    if (firstClip) {
      const asset = project.media.find((m) => m.id === firstClip.media_asset_id);
      if (asset) {
        await play({
          path: asset.path,
          offset_secs: firstClip.source_offset_secs,
          duration_secs: firstClip.duration_secs,
        });
      }
    }
    if (metronomeEnabled) {
      metronomeService.setEnabled(true);
      metronomeService.start(positionSecs, project?.bpm ?? 120);
    }

    // Start MIDI sequencer with all MIDI clips from the project
    const midiClips = (project?.tracks ?? []).flatMap((t) =>
      t.midi_clips.map((clip) => ({ clip, trackStartSecs: clip.start_secs }))
    );
    midiSequencer.start(positionSecs, project?.bpm ?? 120, midiClips);
  };

  const handleStop = () => {
    if (!tauriRuntime) return;
    stop();
    metronomeService.stop();
    midiSequencer.stop();
  };

  const handleLoopToggle = () => {
    if (!loopRegion) {
      // Create a default 2-bar loop at current position
      const bpm = project?.bpm ?? 120;
      const barSecs = (4 * 60) / bpm;
      setLoopRegion({ start_secs: positionSecs, end_secs: positionSecs + barSecs * 2, enabled: true });
    } else if (loopRegion.enabled) {
      clearLoopRegion();
    } else {
      setLoopRegion({ ...loopRegion, enabled: true });
    }
  };

  useEffect(() => {
    if (error) {
      const t = setTimeout(clearError, 5000);
      return () => clearTimeout(t);
    }
  }, [error, clearError]);

  return (
    <header className="relative flex items-center gap-2 h-12 px-3 bg-deck-panel border-b border-deck-border shrink-0 overflow-hidden before:absolute before:inset-0 before:bg-[linear-gradient(90deg,rgba(255,107,26,0.12),transparent_35%,rgba(56,215,255,0.1))] before:pointer-events-none">
      {/* Transport controls */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={handlePlay}
          disabled={status === "playing"}
          className="w-9 h-9 rounded bg-deck-accent hover:bg-deck-accent-dim disabled:opacity-50 flex items-center justify-center text-deck-bg font-display font-semibold"
          title="Play"
        >
          ▶
        </button>
        <button
          type="button"
          onClick={handleStop}
          className="w-9 h-9 rounded bg-deck-muted hover:bg-deck-graphite flex items-center justify-center text-deck-text"
          title="Stop"
        >
          ■
        </button>
      </div>

      <div className="w-px h-6 bg-deck-border shrink-0" />

      {/* Record */}
      <RecordButton />

      <div className="w-px h-6 bg-deck-border shrink-0" />

      {/* Position + BPM */}
      <div className="flex items-center gap-1 font-mono text-sm text-deck-text-muted shrink-0">
        <span className="text-deck-cyan tabular-nums">{formatTime(positionSecs)}</span>
      </div>
      <div className="flex items-center gap-1 font-mono text-sm text-deck-text-muted shrink-0">
        <span className="text-[10px]">BPM</span>
        <span className="text-deck-amber tabular-nums">{project?.bpm ?? 120}</span>
      </div>

      <div className="w-px h-6 bg-deck-border shrink-0" />

      {/* Loop toggle */}
      <button
        type="button"
        onClick={handleLoopToggle}
        title="Toggle loop region"
        className={[
          "px-2 py-1 rounded text-xs font-mono transition-colors shrink-0",
          loopRegion?.enabled
            ? "bg-deck-cyan/20 border border-deck-cyan/60 text-deck-cyan"
            : "bg-deck-muted border border-deck-border text-deck-text-muted hover:border-deck-cyan/30",
        ].join(" ")}
      >
        ⟲ Loop
      </button>

      <div className="w-px h-6 bg-deck-border shrink-0" />

      {/* Metronome */}
      <MetronomeWidget />

      {/* Title */}
      <div className="flex-1 min-w-0 px-2">
        <span className="font-display font-semibold text-deck-text truncate block text-sm">
          {project?.branding.logo_text ?? "DΞVOLUTION"} · {project?.title ?? "Untitled"}
        </span>
        <span className="text-[10px] text-deck-text-muted truncate block">
          {project?.branding.artist_name ?? "DJ Devooo"} · {project?.branding.motto ?? "Artist Operating System"}
        </span>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => persistMainView("arrangement")}
          className={[
            "px-2 py-1 rounded text-[11px] border",
            mainView === "arrangement"
              ? "bg-deck-cyan/15 border-deck-cyan/40 text-deck-cyan"
              : "bg-deck-muted border-deck-border text-deck-text-muted",
          ].join(" ")}
        >
          Arrange
        </button>
        <button
          type="button"
          onClick={() => persistMainView("session")}
          className={[
            "px-2 py-1 rounded text-[11px] border",
            mainView === "session"
              ? "bg-deck-magenta/15 border-deck-magenta/40 text-deck-magenta"
              : "bg-deck-muted border-deck-border text-deck-text-muted",
          ].join(" ")}
        >
          Session
        </button>
        <button
          type="button"
          onClick={() => persistMainView("decks")}
          className={[
            "px-2 py-1 rounded text-[11px] border",
            mainView === "decks"
              ? "bg-deck-cyan/20 border-deck-cyan/50 text-deck-cyan"
              : "bg-deck-muted border-deck-border text-deck-text-muted",
          ].join(" ")}
        >
          Decks
        </button>
        <button
          type="button"
          onClick={() => persistMainView("performance")}
          className={[
            "px-2 py-1 rounded text-[11px] border",
            mainView === "performance"
              ? "bg-deck-accent/20 border-deck-accent/50 text-deck-accent"
              : "bg-deck-muted border-deck-border text-deck-text-muted",
          ].join(" ")}
        >
          Stage
        </button>
      </div>

      {/* File ops */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={handleNew}
          className="px-2.5 py-1.5 rounded text-xs bg-deck-muted hover:bg-deck-graphite"
        >
          New
        </button>
        <button
          type="button"
          onClick={handleOpen}
          className="px-2.5 py-1.5 rounded text-xs bg-deck-muted hover:bg-deck-graphite"
        >
          Open
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="px-2.5 py-1.5 rounded text-xs bg-deck-accent hover:bg-deck-accent-dim"
        >
          Save
        </button>
        <button
          type="button"
          onClick={handleImport}
          className="px-2.5 py-1.5 rounded text-xs bg-deck-muted hover:bg-deck-graphite"
        >
          Import
        </button>
      </div>

      {error && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 px-4 py-2 rounded bg-red-900/80 text-red-100 text-sm z-10">
          {error}
        </div>
      )}
    </header>
  );
}
