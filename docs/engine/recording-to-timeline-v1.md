# Recording To Timeline v1

## Scope

TASK_004 from the engine-first upgrade pack. Recording was capture-only: it
wrote a WAV and left the frontend to stitch the file into the project across
three separate commands, ignoring track arm entirely. This slice makes
recording a DAW operation owned by Rust.

## Implemented

- `Track.armed` is now enforced: `track_set_armed(track_id, armed)` arms one
  track and disarms the rest, since the single capture stream has one
  destination.
- `audio::recording::import_recording_to_timeline(project, wav_path, start)`
  reads the finished WAV, creates the media asset, and places a clip at the
  requested timeline position on the first armed audio track — atomically on
  the Rust project state. Errors are explicit: no armed audio track, an
  unreadable WAV, and an empty recording all fail with clear messages and
  leave the project untouched.
- `recording_stop_to_timeline(start_secs)` stops capture, flushes the WAV,
  and runs the placement in one command. The old `recording_stop` (path-only)
  remains for capture-only use.
- The record button arms the target audio track (preferring an already-armed
  one) before starting, and the recording store now calls the atomic command
  with the latency-compensated start position.

## Manual Verification (Acceptance Test 3)

1. `npm run tauri:dev`, create a project, add an audio track.
2. Seek the transport to 8 seconds.
3. Press ● Arm and speak into the input for ~4 seconds, then stop.
4. Confirm: a WAV exists in the temp dir, a media asset appears in the
   browser, and a clip appears at 8s on the armed track.
5. Press Play from 0 and confirm the recording is audible starting at 8s
   through the arrangement engine.
6. Save, reopen, and confirm the clip persists.
7. Failure case: stop a recording when no audio track is armed (disarm via a
   second client or by deleting the track mid-take) and confirm a clear
   "No armed audio track" error rather than silent loss.

## Automated Verification

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib audio::recording
```

## Known Limitations

- Input monitoring (hearing yourself through the engine while recording) is
  not implemented.
- Recording does not yet target take lanes; it places a plain clip. Take-lane
  loop recording is a later slice.
- The recorded WAV stays in the temp directory; "collect and save" media
  consolidation is not part of this slice.
- Latency compensation is the existing static project setting, not measured
  round-trip latency.
