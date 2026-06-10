# Plugin Chain v2

## Scope

TASK_007 from the engine-first upgrade pack: make the plugin story honest.
Built-ins are proven by tests, external VST3s can be load-tested before you
trust them, and the limits of hosting are stated rather than papered over.

## Implemented

- Built-in processors (Gain, Lowpass, Compressor) are covered by DSP tests:
  gain changes level by the expected amount, the compressor measurably
  reduces dynamic range, bypassed and disabled instances leave audio
  untouched, and swapping chain order changes the result (acceptance
  test 6 semantics).
- Built-ins and external VST3s run in the stereo chain
  (`apply_plugin_chain_stereo`, from the stereo slice): built-ins dual-mono,
  VST3s fed the true L/R pair.
- `plugin_preflight(descriptor_id)` actually loads and initializes the
  plugin at the project sample rate and returns a concrete success note
  (parameter count) or the precise failure stage: missing binary, missing
  `GetPluginFactory`, scanner miss, load failure, or initialize failure.
  Nothing is reported "hostable" without having been hosted.
- The plugin panel's registry list gains a per-plugin "Test" button showing
  ✓/✗ with the full message on hover.

## Manual Verification (Acceptance Test 6)

1. Insert built-in Gain on a track with a clip; set gain to -12 dB; play —
   level drops; export — same drop.
2. Insert Compressor after it with a low threshold; loud sections are tamed.
3. Bypass the compressor: dynamics return.
4. Reorder gain/compressor and confirm the audible difference.
5. Click "Test" on a scanned VST3: a real load/initialize runs and reports
   success or the concrete failure reason.

## Known Limitations

- External VST3 processing is offline-render hosting, not low-latency live
  insert processing; plugin failures during render are logged and the plugin
  is skipped (the preflight exists so you find out before relying on one).
- Plugin latency compensation is not implemented (no latency metadata yet).
- Built-in chain state is parameter-based; external plugin state round-trips
  through `serialized_state_b64` but there is no preset browser.
