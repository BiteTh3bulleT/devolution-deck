# Live / Export Parity v1

## Scope

This slice implements TASK_002 from the engine-first upgrade pack: the master
mixdown export now runs through the exact same arrangement summing path that
realtime transport playback uses, so what you hear when you press Play is what
lands in the exported WAV.

## Implemented

- `engine::mix_rendered_tracks_for_export(tracks, sample_rate, start, end)` —
  range-aware export mix that shares the internal summing/silence-guard helper
  with `mix_rendered_tracks_for_playback`.
- `engine::render_project_for_export(project, start_secs, end_secs)` — renders
  the project tracks with the same mute/solo/volume/plugin/sidechain semantics
  as live playback (`render_project_tracks(project, false)`) and mixes them
  with the shared helper.
- `engine::export_project_mixdown_to_wav(project, path, start, end)` — writes
  the mixed buffer as a 32-bit float mono WAV and reports sample rate, sample
  count, and duration.
- New Tauri command `mixdown_export_start(config)` with
  `{ output_dir, file_name?, start_secs?, end_secs? }`. It validates the output
  path, rejects inverted ranges, records a completed `mixdown_export`
  `RenderJob` in project history, and returns the job.
- Render panel gained a "Master Mixdown" section with optional file name and
  optional range limiting, listed alongside stem export.

## Parity Guarantees (tested)

- `audio::engine::tests::export_mixdown_matches_live_playback_for_same_project`
  proves the export buffer is sample-identical to the live transport buffer for
  the same project.
- `audio::engine::tests::export_project_mixdown_writes_wav_matching_live_buffer`
  proves the WAV on disk contains exactly the live playback samples.
- `audio::engine::tests::export_mixdown_honors_explicit_end_range` and
  `..._rejects_silent_range` cover range trimming and the explicit
  "no audible material" failure instead of silently writing an empty file.

## Manual Verification

1. Start the desktop runtime with `npm run tauri:dev`.
2. Open a project with clips on at least two tracks (offset start times).
3. Press Play and note when each track enters and its loudness.
4. Open the Render panel, choose an output directory, and click
   "Export Mixdown".
5. Play the exported WAV in any player and confirm entry times, mute state,
   and levels match what the transport played.
6. Mute a track, export again, and confirm the muted track is absent from the
   new WAV exactly as it is absent from live playback.
7. Enable "Limit to range", set an inverted range (end before start), and
   confirm the export is blocked with a clear error.
8. Confirm the completed `mixdown_export` job appears in Render Jobs and
   survives project save/reopen.

## Automated Verification

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib audio::engine
cargo check --manifest-path src-tauri/Cargo.toml
npm run build
npm run lint
```

## Known Limitations

- The mixdown is still mono 32-bit float WAV because the shared render path
  decodes and sums mono buffers; stereo preservation is the Stereo Engine
  milestone.
- Master gain is not yet a project parameter; the mixdown is the unity sum of
  track outputs with per-sample clamping, identical to live playback.
- Export renders the whole arrangement before trimming the requested range, so
  very long projects pay full render cost even for short ranges.
- MP3/FLAC/bit-depth options are out of scope for this slice.
