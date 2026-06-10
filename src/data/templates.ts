import type { TemplateDefinition } from "../types";

export const EDM_TEMPLATES: TemplateDefinition[] = [
  {
    id: "edm-big-room-starter",
    name: "Big Room Starter",
    genre: "EDM",
    description: "Mainstage-oriented stack with sidechain-ready drums and lead buses.",
    bpm: 128,
    tracks: [
      { name: "Kick", role: "drums", track_type: "audio" },
      { name: "Drums Top", role: "drums", track_type: "audio" },
      { name: "Bass", role: "bass", track_type: "midi" },
      { name: "Chords", role: "harmonic", track_type: "midi" },
      { name: "Lead", role: "lead", track_type: "midi" },
      { name: "FX", role: "fx", track_type: "audio" },
      { name: "Vox Chop", role: "vocals", track_type: "audio" },
    ],
  },
  {
    id: "edm-melodic-house",
    name: "Melodic House Flow",
    genre: "EDM",
    description: "Deeper melodic template with longer arrangement and send-heavy ambience.",
    bpm: 124,
    tracks: [
      { name: "Kick", role: "drums", track_type: "audio" },
      { name: "Perc Loop", role: "drums", track_type: "audio" },
      { name: "Sub Bass", role: "bass", track_type: "midi" },
      { name: "Pluck", role: "lead", track_type: "midi" },
      { name: "Atmos", role: "texture", track_type: "audio" },
      { name: "Pad", role: "harmonic", track_type: "midi" },
    ],
  },
  {
    id: "edm-dnb-night",
    name: "DNB Night Shift",
    genre: "EDM",
    description: "Fast-grid drum and reese workflow with scene launcher emphasis.",
    bpm: 174,
    tracks: [
      { name: "Break Core", role: "drums", track_type: "audio" },
      { name: "Kick Layer", role: "drums", track_type: "audio" },
      { name: "Reese", role: "bass", track_type: "midi" },
      { name: "Neuro Bass", role: "bass", track_type: "audio" },
      { name: "Synth Stab", role: "lead", track_type: "midi" },
      { name: "Vox FX", role: "fx", track_type: "audio" },
    ],
  },
];
