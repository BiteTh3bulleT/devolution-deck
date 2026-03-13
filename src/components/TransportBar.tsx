import { useProjectStore } from "../stores/projectStore";
import { useTransportStore } from "../stores/transportStore";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { useEffect } from "react";
import * as api from "../api";

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const ms = Math.floor((secs % 1) * 100);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

export function TransportBar() {
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

  const handleNew = async () => {
    await newProject();
  };

  const handleOpen = async () => {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: "DevoDeck Project", extensions: ["deck"] }],
    });
    if (selected) await open(selected);
  };

  const handleSave = async () => {
    if (projectPath) {
      await save();
      return;
    }
    const selected = await saveDialog({
      defaultPath: project?.title ? `${project.title}.deck` : "untitled.deck",
      filters: [{ name: "DevoDeck Project", extensions: ["deck"] }],
    });
    if (selected) await save(selected);
  };

  const handleImport = async () => {
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
            proj = await projectGet();
          }
        } catch (e) {
          console.error("Import failed", p, e);
        }
      }
      useProjectStore.getState().load();
    }
  };

  const handlePlay = async () => {
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
  };

  const handleStop = () => {
    stop();
  };

  useEffect(() => {
    if (error) {
      const t = setTimeout(clearError, 5000);
      return () => clearTimeout(t);
    }
  }, [error, clearError]);

  return (
    <header className="flex items-center gap-4 h-12 px-4 bg-deck-panel border-b border-deck-border shrink-0">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handlePlay}
          disabled={status === "playing" || !project?.tracks.some((t) => t.clips.length > 0)}
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
      <div className="w-px h-6 bg-deck-border" />
      <div className="flex items-center gap-2 min-w-[120px] font-mono text-sm text-deck-text-muted">
        <span>Position</span>
        <span className="text-deck-cyan tabular-nums">{formatTime(positionSecs)}</span>
      </div>
      <div className="w-px h-6 bg-deck-border" />
      <div className="flex items-center gap-2 min-w-[80px] font-mono text-sm text-deck-text-muted">
        <span>BPM</span>
        <span className="text-deck-amber tabular-nums">{project?.bpm ?? 120}</span>
      </div>
      <div className="flex-1 min-w-0 mx-4">
        <span className="font-display font-semibold text-deck-text truncate block">
          {project?.title ?? "Untitled"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleNew}
          className="px-3 py-1.5 rounded text-sm bg-deck-muted hover:bg-deck-graphite"
        >
          New
        </button>
        <button
          type="button"
          onClick={handleOpen}
          className="px-3 py-1.5 rounded text-sm bg-deck-muted hover:bg-deck-graphite"
        >
          Open
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="px-3 py-1.5 rounded text-sm bg-deck-accent hover:bg-deck-accent-dim"
        >
          Save
        </button>
        <button
          type="button"
          onClick={handleImport}
          className="px-3 py-1.5 rounded text-sm bg-deck-muted hover:bg-deck-graphite"
        >
          Import
        </button>
      </div>
      {error && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 px-4 py-2 rounded bg-red-900/80 text-red-100 text-sm">
          {error}
        </div>
      )}
    </header>
  );
}
