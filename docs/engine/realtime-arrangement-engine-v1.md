# Realtime Arrangement Engine v1

## Scope

This pass starts the engine-first upgrade from `DEVOLUTION_DECK_UPGRADE.zip`.

The main desktop transport now renders the current project arrangement into a realtime playback buffer instead of deriving playback from the first audio clip. The engine uses the existing Rust project state and offline render path so live playback moves toward export parity.

## Implemented

- `src-tauri/src/audio/engine/` exists as the home for realtime arrangement engine primitives.
- `render_project_for_realtime_playback(project, start_secs)` renders the full arrangement from a timeline position.
- `mix_rendered_tracks_for_playback(...)` mixes rendered track buffers, clips samples, validates sample-rate consistency, and returns a mono playback buffer with a timeline clock start.
- New Tauri command: `playback_play_arrangement(start_secs)`.
- Frontend main transport calls arrangement playback from the current timeline position.
- The old `playback_play(payload)` clip-preview path remains available separately.

## Manual Verification

1. Start the desktop runtime with `npm run tauri:dev`.
2. Create or open a project.
3. Import two audible audio files.
4. Place one clip on Track 1 at `0s`.
5. Place a second clip on Track 2 at `4s`.
6. Press Play from the beginning.
7. Confirm Track 1 is audible at `0s` and Track 2 enters at `4s`.
8. Stop, seek to `4s`, and press Play again.
9. Confirm playback begins from the timeline position and Track 2 is audible immediately.
10. Mute Track 1 and play again.
11. Confirm Track 1 is silent and Track 2 remains audible.

## Automated Verification

```bash
cargo test --manifest-path src-tauri/Cargo.toml audio::engine::tests::mixes_all_rendered_tracks_from_requested_timeline_start
cargo check --manifest-path src-tauri/Cargo.toml
npm run build
npm run lint
```

## Known Limitations

- The first realtime engine buffer is rendered ahead of playback, not streamed sample-by-sample from a low-latency graph.
- Output is still mono because the current shared render path decodes and mixes mono buffers.
- Transport metering is not yet driven by the realtime engine.
- Full automation, pan, stereo preservation, plugin safety, and deck graph integration remain later engine milestones.
