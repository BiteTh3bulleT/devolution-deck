# MIDI Engine v1

## Scope

TASK_008 from the engine-first upgrade pack. MIDI clips were already rendered
into the shared arrangement path (so scheduling is tied to the engine clock
and export includes MIDI by construction); this slice formalizes the synth
into an engine module and adds a second real voice.

## Implemented

- `engine::midi_synth` owns built-in MIDI voices. Notes render at engine-
  clock positions inside the shared track render, so live playback, mixdown
  export, and stems stay sample-identical and MIDI is always in sync with
  audio clips on other tracks.
- Voice selection follows the track's `InstrumentAssignment.plugin_type`:
  `builtin_drums` → drum voices, anything else (including no instrument)
  → the sine synth.
- Synth voice: sine with attack and release envelope (release removes the
  hard cutoff click the old inline synth had).
- Drum voices by pitch zone: below 38 = kick (pitch-swept sine, fast decay),
  38–49 = snare (tone + deterministic noise burst), 50+ = hat (short noise
  tick). Noise is a pure function of sample index, so renders are
  deterministic and live/export stay identical.
- Velocity scales amplitude for every voice (tested).

## Tested

- Audio appears only inside the note span at the right timeline position.
- Velocity 127 vs 32 changes level by more than 2×.
- The drum voice produces output and differs from the synth voice.
- Voice selection mapping from `plugin_type`.

## Manual Verification

1. Create a MIDI track, draw notes in the piano roll, press Play — notes
   sound at the right beats alongside audio tracks.
2. Assign the "builtin_drums" instrument in the instrument panel; pitches
   around 36 become kicks, 38–49 snares, 50+ hats.
3. Export a mixdown and confirm the MIDI output is present and identical to
   what was heard live.

## Known Limitations

- Two built-in voices only; no VST instrument hosting for MIDI tracks yet.
- No per-note pan/aftertouch; pitch bend and CCs are not modeled.
- `MidiClip.loop_clip` is not honored by the renderer yet.
