# Stereo Engine v1

## Scope

TASK_005 from the engine-first upgrade pack. The arrangement render path —
and therefore live playback, mixdown export, stem export, freeze, and
render-in-place — is now interleaved stereo end to end. Mono is preserved as
a compatibility case, not the engine's shape.

## Implemented

- `decode_audio_stereo` preserves the left/right pair of stereo sources;
  mono sources are duplicated to both channels; sources with more than two
  channels use their first two.
- `RenderedTrack` carries interleaved samples plus an explicit `channels`
  field; the shared mixdown helper validates channel consistency across
  tracks and mixes per frame, so the silence guard, range trimming, and
  master gain all operate on stereo frames.
- Track pan is applied as a balance law: unity at center, attenuating the
  opposite channel toward the extremes, never boosting. The mixer panel's
  existing pan slider is now audible.
- Plugin chains process stereo: built-ins run dual-mono per channel and
  external VST3 instances receive the true left/right pair
  (`apply_plugin_chain_stereo`). The mono chain remains for the single-clip
  preview path.
- Sidechain ducking follows the mean absolute value of each source frame and
  applies its gain to every channel of the target frame, preserving the
  stereo image.
- Mixdown export, stem export, freeze, and render-in-place write stereo
   32-bit float WAVs (`write_wav` with channel count); media assets created
  from them record `channels: 2` and frame-accurate durations.
- Meters scan all channels of each frame window.
- Seeking the sample player rounds to whole frames first so a seek can never
  land mid-frame and swap channels.

## Tested

- `stereo_clip_preserves_left_right_in_live_and_export` — distinct L/R values
  survive decode → render → mix in both live and export, bit-identically.
- `mono_clip_renders_identically_to_both_channels` — mono compatibility.
- `pan_acts_as_balance_between_channels` — hard left/right silences the
  opposite channel without boosting the remaining one.
- All earlier parity/master-gain/meter tests still pass on the stereo path.

## Manual Verification (Acceptance Test 5)

1. Import a file with an obvious left/right difference (e.g. guitar left,
   vocal right).
2. Play the arrangement — the image must match the source in headphones.
3. Export a mixdown and inspect/play the WAV: 2 channels, same image.
4. Pan the track hard left: the right channel goes silent live and in a
   fresh export.
5. Import a mono file and confirm it appears centered (both channels equal).

## Known Limitations

- The single-clip preview path (`playback_play`) remains mono.
- Per-channel waveform display is not implemented; peaks are computed from
  the mono fold-down.
- Built-in plugins are dual-mono (independent per channel); a stereo-linked
  compressor is future work.
- Sources with more than two channels are reduced to their first two rather
  than properly downmixed.
