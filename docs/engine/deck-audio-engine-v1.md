# Deck Audio Engine v1

This slice implements the first real audio path for `TASK_009_DECK_AUDIO_ENGINE`.

## Implemented

- Active Deck A/B states now render to a stereo sample buffer through `audio::deck_engine`.
- `deck_set_playing` validates that the deck has a loaded track, decodes the referenced media asset, applies deck gain and crossfader gain, and starts the shared playback handle.
- If both decks are playing, the command renders both loaded assets into one mixed buffer.
- Seek, hot-cue trigger, loop set/clear, turntable nudge/scratch, and crossfader updates refresh active deck playback.
- Loop state wraps the rendered source position inside the saved loop region.
- Tempo multiplier advances the deck read position faster or slower. This is sample-rate based playback speed, not a phase-vocoder time-stretch engine.

## Manual Verification

1. Start the desktop runtime with `npm run tauri:dev`.
2. Import two audio files and analyze them into library items.
3. Open Deck Performance view and load one item into Deck A and one into Deck B.
4. Press Play on Deck A; confirm the loaded asset is audible.
5. Press Play on Deck B; confirm both decks are mixed.
6. Move the crossfader left/right; confirm the audible balance changes immediately.
7. Trigger a hot cue or seek while playing; confirm playback restarts from the new deck position.
8. Set a short loop and play through it; confirm the rendered buffer repeats the loop region.
9. Try to play an unloaded deck; confirm the command reports a clear failure.

## Current Limits

- Deck playback renders a finite 180-second buffer each time audible deck state changes.
- Tempo multiplier changes playback speed and pitch together; pitch lock is persisted but not yet implemented as independent time-stretch/pitch-shift.
- Deck meters are not yet separated from arrangement meters.
- Sampler pads still update project/performance state, but they are not mixed into the deck audio buffer yet.
- Deck state position is not continuously written back while the playback buffer is running.
