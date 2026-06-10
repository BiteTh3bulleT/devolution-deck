# Automation Engine v1

## Scope

TASK_006 from the engine-first upgrade pack. Automation lanes existed in the
project model and the editor evaluated them for display, but the audible
engine ignored them — exactly the "UI/model-only" failure the acceptance
tests call out. Volume and pan automation are now rendered.

## Implemented

- `engine::automation::evaluate_lane(lane, time, fallback)` mirrors the
  TypeScript editor math (`src/services/automationEngine.ts`) point for
  point: clamp before first / after last point, linear interpolation, and the
  same ease-in/ease-out curve law (`k = 1 + |curve| * 3`), so what the editor
  draws is what the engine plays.
- `LaneSampler` pre-sorts lane points once and advances a cursor while
  rendering, so per-frame evaluation stays O(1) amortized.
- `render_arrangement_track` applies `volume_db` and `pan` lanes per frame
  when an enabled, non-empty lane exists for the track; otherwise it keeps
  the static-parameter fast path. Disabled lanes have zero effect.
- Because automation is applied inside the shared rendered-track path, live
  playback, mixdown export, stem export, freeze, and render-in-place all get
  identical automation for free (asserted by test).

## Tested

- Evaluator semantics: fallback for disabled/empty lanes, edge clamping,
  linear midpoints, and the exact ease-out value the frontend law produces.
- `volume_automation_shapes_live_and_export_identically` — a 0 dB → -60 dB
  ramp audibly fades the rendered audio, live equals export sample-for-
  sample, and disabling the lane restores flat output.

## Manual Verification (Acceptance Test 4)

1. Put a clip on a track and draw a volume ramp from 0 dB down to -60 dB in
   the automation panel.
2. Play: the track fades out over the lane's duration.
3. Export a mixdown: the WAV fades identically.
4. Disable the lane: playback and export return to constant level.
5. Draw a pan sweep left → right and confirm the image moves during
   playback and in an exported WAV.

## Known Limitations

- Plugin parameter automation is not evaluated yet; only `volume_db` and
  `pan` lanes are audible. The evaluator is parameter-agnostic, so plugin
  automation can reuse it when the plugin chain learns time-varying
  parameters.
- Automation is sampled per frame against the engine's render-ahead buffer;
  editing a lane during playback requires restarting playback to be heard.
