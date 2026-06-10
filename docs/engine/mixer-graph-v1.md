# Mixer Graph v1

This slice connects the existing track mixer state to the shared arrangement render path used by realtime playback and mixdown.

## Implemented

- Track volume is applied during arrangement track rendering.
- Track mute silences tracks in the shared rendered-track path.
- Track solo is now honored when `include_muted` is false: if any track is soloed, only unmuted soloed tracks remain audible.
- The mixer panel exposes both `S` and `M` toggles and persists changes through the project update command.

## Current Limits

- Rendering is still mono, so persisted pan values are editable but not yet applied to a stereo signal.
- Master gain and true bus/return summing are not part of this slice.
- UI meters still need to be fed from actual playback/render signal data.
