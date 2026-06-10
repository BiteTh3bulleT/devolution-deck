import { useMemo } from "react";
import { useProjectStore } from "../stores/projectStore";
import { useSessionStore } from "../stores/sessionStore";
import type { SessionClip, Track } from "../types";

function formatLaunchTime(value: number | null): string {
  if (value == null) return "-";
  return `${value.toFixed(2)}s`;
}

export function SessionLauncher() {
  const project = useProjectStore((s) => s.project);
  const selectScene = useSessionStore((s) => s.selectScene);
  const selectedSceneId = useSessionStore((s) => s.selectedSceneId);
  const addScene = useSessionStore((s) => s.addScene);
  const captureCellFromTrack = useSessionStore((s) => s.captureCellFromTrack);
  const removeCell = useSessionStore((s) => s.removeCell);
  const launchScene = useSessionStore((s) => s.launchScene);
  const queuedSceneId = useSessionStore((s) => s.queuedSceneId);
  const queuedLaunchAtSecs = useSessionStore((s) => s.queuedLaunchAtSecs);
  const isLaunching = useSessionStore((s) => s.isLaunching);

  const tracks = project?.tracks ?? [];
  const scenes = project?.session.scenes ?? [];
  const clips = project?.session.clips ?? [];

  const clipMap = useMemo(
    () =>
      new Map(clips.map((clip) => [`${clip.track_id}:${clip.scene_id}`, clip])),
    [clips]
  );

  if (!project) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-deck-text-muted">
        No project loaded.
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-deck-bg">
      <div className="flex items-center justify-between px-3 py-2 border-b border-deck-border bg-deck-panel/80">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-display tracking-widest uppercase text-deck-cyan">Session Launcher</h2>
          <span className="text-[10px] text-deck-text-muted">
            Quantize: {project.session.launch_quantize_beats} beats
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-deck-text-muted">
            Queue: {queuedSceneId ? `${queuedSceneId.slice(0, 6)} @ ${formatLaunchTime(queuedLaunchAtSecs)}` : "idle"}
          </span>
          <button
            type="button"
            onClick={() => void addScene()}
            className="px-2.5 py-1 rounded text-xs border border-deck-border bg-deck-muted hover:bg-deck-graphite"
          >
            + Scene
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div
          className="grid min-w-max"
          style={{
            gridTemplateColumns: `180px repeat(${tracks.length}, minmax(180px, 1fr))`,
          }}
        >
          <div className="sticky top-0 z-10 bg-deck-panel border-b border-r border-deck-border p-2 text-[10px] uppercase text-deck-text-muted">
            Scene
          </div>
          {tracks.map((track) => (
            <div
              key={track.id}
              className="sticky top-0 z-10 bg-deck-panel border-b border-r border-deck-border p-2 text-[10px] uppercase text-deck-text-muted"
              title={track.name}
            >
              {track.name}
            </div>
          ))}

          {scenes.length === 0 && (
            <div className="col-span-full p-5 text-sm text-deck-text-muted">
              Add a scene, then click empty cells to capture clips from arrangement tracks.
            </div>
          )}

          {scenes.map((scene) => (
            <FragmentRow
              key={scene.id}
              sceneId={scene.id}
              sceneName={scene.name}
              selectedSceneId={selectedSceneId}
              isQueued={queuedSceneId === scene.id}
              isLaunching={isLaunching}
              onSelect={selectScene}
              onLaunch={launchScene}
              tracks={tracks}
              clipMap={clipMap}
              onCapture={captureCellFromTrack}
              onRemove={removeCell}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface FragmentRowProps {
  sceneId: string;
  sceneName: string;
  selectedSceneId: string | null;
  isQueued: boolean;
  isLaunching: boolean;
  tracks: Track[];
  clipMap: Map<string, SessionClip>;
  onSelect: (sceneId: string) => void;
  onLaunch: (sceneId: string) => Promise<void>;
  onCapture: (trackId: string, sceneId: string) => Promise<void>;
  onRemove: (trackId: string, sceneId: string) => Promise<void>;
}

function FragmentRow({
  sceneId,
  sceneName,
  selectedSceneId,
  isQueued,
  isLaunching,
  tracks,
  clipMap,
  onSelect,
  onLaunch,
  onCapture,
  onRemove,
}: FragmentRowProps) {
  return (
    <>
      <div className="border-b border-r border-deck-border bg-deck-surface/80 p-2">
        <button
          type="button"
          onClick={() => onSelect(sceneId)}
          className={[
            "w-full text-left rounded px-2 py-1.5 text-xs border transition-colors",
            selectedSceneId === sceneId
              ? "bg-deck-cyan/15 border-deck-cyan/40 text-deck-cyan"
              : "bg-deck-muted border-deck-border text-deck-text-muted hover:border-deck-cyan/30",
          ].join(" ")}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">{sceneName}</span>
            <span className="text-[9px] uppercase">{isQueued ? "Queued" : "Ready"}</span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => void onLaunch(sceneId)}
          disabled={isLaunching}
          className="mt-1.5 w-full rounded px-2 py-1 text-[11px] bg-deck-magenta/20 text-deck-magenta border border-deck-magenta/30 hover:border-deck-magenta/60 disabled:opacity-60"
        >
          Launch Scene
        </button>
      </div>

      {tracks.map((track) => {
        const key = `${track.id}:${sceneId}`;
        const clip = clipMap.get(key);
        return (
          <div key={key} className="border-b border-r border-deck-border bg-deck-surface/30 p-1.5 min-h-[60px]">
            {clip ? (
              <div className="h-full rounded border border-deck-cyan/30 bg-deck-panel p-1.5 flex flex-col">
                <span className="text-[10px] text-deck-text truncate">{clip.name}</span>
                <span className="text-[10px] text-deck-text-muted mt-1">
                  {clip.source.kind === "audio" ? "Audio" : "MIDI"} · {clip.length_secs.toFixed(2)}s
                </span>
                <button
                  type="button"
                  onClick={() => void onRemove(track.id, sceneId)}
                  className="mt-auto text-[10px] text-red-300/80 hover:text-red-200 text-left"
                >
                  Clear
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void onCapture(track.id, sceneId)}
                className="w-full h-full rounded border border-dashed border-deck-border text-[11px] text-deck-text-muted hover:border-deck-cyan/50 hover:text-deck-cyan transition-colors"
              >
                + Capture
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}
