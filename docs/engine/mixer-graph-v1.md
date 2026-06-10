# Mixer Graph v1

This slice connects the existing track mixer state to the shared arrangement render path used by realtime playback and mixdown.

## Implemented

- Track volume is applied during arrangement track rendering.
- Track mute silences tracks in the shared rendered-track path.
- Track solo is now honored when `include_muted` is false: if any track is soloed, only unmuted soloed tracks remain audible.
- The mixer panel exposes both `S` and `M` toggles and persists changes through the project update command.
- `Project.master_gain_db` (serde default `0.0`, so existing `.deck` files load
  unchanged) is applied inside the shared mixdown helper before the final
  clamp, so live playback and mixdown export scale identically
  (`master_gain_scales_live_and_export_identically` test).
- Meters are real: `playback_play_arrangement` retains the per-track and
  master buffers it mixed, and the `playback_meters` command reports the peak
  of a 50 ms window at the engine clock position from those exact buffers.
  Stopped transport reports zeroed meters; it never invents signal.
- The mixer panel shows a master strip (gain slider + meter) and a per-track
  meter bar, polling `playback_meters` at 10 Hz only while playing.

## Manual Verification

1. `npm run tauri:dev`, open a project with audible clips.
2. Press Play — track meters and the master meter move with the audio; a
   muted track's meter stays at zero.
3. Drag Master Gain down to -60 dB, restart playback, and confirm both the
   audio and the master meter drop.
4. Export a mixdown at the same master gain and confirm the WAV level matches
   what was heard live.
5. Stop transport — meters return to zero immediately.

## Current Limits

- Rendering is still mono, so persisted pan values are editable but not yet applied to a stereo signal (Stereo Engine milestone).
- True bus/return summing is not part of this slice.
- Meters are peak-only (no RMS ballistics or clip-hold) and update at the
  10 Hz poll rate, not per audio callback.
- Changing mixer state during playback requires restarting playback to be
  heard; the engine renders ahead rather than streaming live state.
