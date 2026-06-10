/**
 * RecordButton — ARM/record toggle with status indicator.
 * Shows idle/count_in/recording/stopping states.
 */

import * as api from "../api";
import { useRecordingStore } from "../stores/recordingStore";
import { useTransportStore } from "../stores/transportStore";
import { useProjectStore } from "../stores/projectStore";

export function RecordButton() {
  const status = useRecordingStore((s) => s.status);
  const startRecording = useRecordingStore((s) => s.startRecording);
  const stopRecording = useRecordingStore((s) => s.stopRecording);
  const positionSecs = useTransportStore((s) => s.positionSecs);
  const project = useProjectStore((s) => s.project);

  const isActive = status === "recording" || status === "count_in";

  const handleClick = async () => {
    if (isActive) {
      await stopRecording();
      return;
    }
    if (status === "stopping") return;
    // Record onto the armed audio track; arm the first audio track if none is armed.
    const audioTracks = project?.tracks.filter((t) => t.track_type === "audio") ?? [];
    const targetTrack = audioTracks.find((t) => t.armed) ?? audioTracks[0];
    if (!targetTrack) {
      alert("Add an audio track first");
      return;
    }
    if (!targetTrack.armed) {
      await api.trackSetArmed(targetTrack.id, true);
      await useProjectStore.getState().load();
    }
    await startRecording(targetTrack.id, positionSecs);
  };

  const label =
    status === "count_in"
      ? "Count in…"
      : status === "recording"
      ? "● REC"
      : status === "stopping"
      ? "Stopping…"
      : "● Arm";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "stopping"}
      className={[
        "px-3 py-1.5 rounded text-sm font-mono transition-colors",
        status === "recording"
          ? "bg-red-700 hover:bg-red-600 text-white animate-pulse"
          : status === "count_in"
          ? "bg-red-900/60 text-red-300 border border-red-700/50"
          : "bg-deck-muted hover:bg-red-900/50 text-deck-text-muted hover:text-red-300 border border-deck-border",
        status === "stopping" ? "opacity-50 cursor-not-allowed" : "",
      ].join(" ")}
      title="Record audio (requires input device)"
    >
      {label}
    </button>
  );
}
