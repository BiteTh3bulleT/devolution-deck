/**
 * InstrumentPanel — instrument selector for MIDI tracks shown in UtilityPanel.
 */

import { useCallback } from "react";
import type { Track, InstrumentAssignment } from "../types";
import * as api from "../api";
import { useProjectStore } from "../stores/projectStore";
import { useMidiStore } from "../stores/midiStore";
import { v4 as uuidv4 } from "../utils/uuid";

const BUILTIN_PRESETS: InstrumentAssignment[] = [
  { id: "builtin_synth_lead", name: "Lead Synth", plugin_type: "builtin_synth" },
  { id: "builtin_synth_pad", name: "Pad Synth", plugin_type: "builtin_synth" },
  { id: "builtin_synth_bass", name: "Bass Synth", plugin_type: "builtin_synth" },
  { id: "builtin_drums_gm", name: "GM Drum Kit", plugin_type: "builtin_drums" },
];

interface InstrumentPanelProps {
  track: Track;
}

export function InstrumentPanel({ track }: InstrumentPanelProps) {
  const load = useProjectStore((s) => s.load);
  const openDrumSequencer = useMidiStore((s) => s.openDrumSequencer);

  const handleSelect = useCallback(
    async (preset: InstrumentAssignment) => {
      try {
        await api.trackSetInstrument(track.id, { ...preset, id: uuidv4() });
        await load();
      } catch (e) {
        console.error("trackSetInstrument failed", e);
      }
    },
    [track.id, load]
  );

  const current = track.instrument;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-display uppercase tracking-wider text-deck-text-muted">
        Instrument
      </h3>
      {current && (
        <div className="devooo-chip-active flex items-center px-3">
          <span className="text-xs font-mono text-deck-accent">{current.name}</span>
          <span className="text-[9px] text-deck-text-muted/60 ml-2">{current.plugin_type}</span>
        </div>
      )}
      <div className="space-y-1">
        {BUILTIN_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => handleSelect(p)}
            className={[
              "devooo-button-wide w-full text-left px-3 py-1.5 text-xs font-mono transition-colors",
              current?.name === p.name
                ? "text-deck-text"
                : "text-deck-text-muted",
            ].join(" ")}
          >
            {p.name}
          </button>
        ))}
      </div>
      {current?.plugin_type === "builtin_drums" && (
        <button
          type="button"
          onClick={() => openDrumSequencer(track)}
          className="devooo-button-wide w-full px-3 py-1.5 text-xs text-deck-magenta font-mono mt-1"
        >
          Open Drum Sequencer →
        </button>
      )}
      <p className="text-[9px] text-deck-text-muted/40 mt-1">
        VST hosting available in Phase 3.
      </p>
    </div>
  );
}
