# Live DJ and stage engine — v0.4

The user-selected lead workflow is live DJ and stage performance. A full professional DAW remains a multi-release program; v0.4 establishes an inspectable native output boundary and cue routing.

## Implemented

CPAL owns a persistent output stream on a dedicated producer thread. Its hardware callback consumes a fixed-capacity rtrb queue and uses atomics for transport state and counters. It does not decode files, render projects, wait on a mutex, allocate/free heap memory, perform disk I/O, or log. Queue capacity is 8192 frames. Queue target adapts to twice the requested or observed device callback size, capped at 4096 frames. Stale frames are rejected after seeks, source replacement and Stop. The callback publishes the consumed arrangement position.

Native stereo/mono and signed/unsigned integer/float device formats are supported. Device rate conversion runs on the producer, using linear interpolation from the current 48 kHz internal engine. System exposes device/rate/requested buffer, main and headphone cue channel pairs, cue gain, observed callback size, queue depth, underruns, invalid samples, device errors, clipping and callback timing. The latency value is a buffered-output estimate, excluding hardware and capture latency. It is not a measured round-trip value. Windows currently uses the CPAL default WASAPI host; ASIO is not implemented.

Output settings persist atomically in LOCALAPPDATA/devolution-deck/audio-output.json. A missing saved device produces an explicit error; startup does not silently route to another named device. Settings apply only while playback and recording are stopped. An unsuccessful replacement keeps the previous driver/settings. The app remains available when output initialization fails.

Two decks can feed the independent stereo cue bus before their crossfader gain. Cue requires a separate hardware pair on the same multichannel device. Unassigned channels remain silent. Project schema 10 stores each deck's cue switch and migrates older projects with cue off. No cue is sent to the main pair when a device only has two channels.

Arrangement preparation happens off the Tauri UI task. Native start tickets ensure Stop, project changes and newer starts invalidate older render results. Frontend transport tracks starting/playing/stopped and rejects stale asynchronous replies. Audio Stop dispatches before recorded-take finalization. Floating-point track/master rendering retains headroom; the hardware conversion clamps its outgoing samples and reports clipping.

## Boundaries still to replace

Arrangement playback is still rendered into a whole buffer before starting. Project refresh still re-renders it. Deck assets are fully decoded/cached, and their producer positions lead audible output by the queued frames. The shared stage/MIDI/lighting scheduler is not yet a sample-accurate engine clock. Persistent DSP/VST graph processing, plugin latency compensation and plugin crash isolation remain future work. Existing deck pitch-lock/filter preferences are not evidence of implemented independent time-stretch/filter DSP. Input software monitoring is explicitly marked planned. Current device conversion uses linear resampling, not a mastering-grade bandlimited resampler.

## Next implementation gates, in order

1. One sample clock and bounded command scheduling for decks, transport, scene launch, quantized loops, MIDI and show events. Meter the actual main/cue signal. Prove seek/loop/Stop behavior under concurrent commands and CPU load.
2. Disk streaming and reusable block DSP graph, including persistent effects and plugin state, bus/sends, latency compensation and isolated third-party plugin failures. Remove whole-arrangement render latency and memory scaling.
3. DJ engine: independent pitch/time controls, filters/EQ, gain smoothing, slip/reverse/beat jump, reliable beat-grid editing and controller MIDI/HID learn. Expand deck count only after stable two-deck measurements.
4. Performance I/O: low-latency interface drivers, main/cue/booth buses, capture and punch-in with measured latency, monitor routing, hot-unplug recovery and explicit reconnect controls.
5. Complete production workflow: piano-roll/drum editing, automation write modes, robust undo/redo, instruments/MPE, comping, offline/real-time export and session/media portability.
6. Stage qualification: sustained non-silent set playback, maximum supported load, rapid controller input, device disconnect/reconnect and end-to-end blackout/panic tests with the intended interface, MIDI controllers and venue equipment. A 30-second silent device test is not stage qualification.

## Verification

76 native unit/regression tests and 10 frontend concurrency tests pass. A thread-local counting allocator verifies zero allocations/deallocations within the callback across normal playback, starvation, generation change and Stop. Routing tests verify cue gain/pair separation and silence in unused channels. Driver-ignored buffer sizing has a regression test. Float-headroom rendering, schema migration, native start cancellation and prefetch discard are covered.

A 30-second silent hardware playback run on the local CORSAIR WASAPI device delivered 3002 callbacks of 480 frames at 48 kHz, with zero underruns, invalid samples or clipped samples. Debug callback average was 144.45 microseconds and max 517.3 microseconds. This run used silent audio, main channels 1/2, no cue, and is specific to that machine/run. Cue separation is unit-tested and its UI IPC contract is browser-tested; physical headphone/interface routing remains unverified.

The React browser test uses an explicit native verification adapter and intercepted output-setting responses. Those fixtures never ship in production. The Windows installer contains the real native CPAL engine.

Library references: https://docs.rs/cpal/0.15.3/cpal/ and https://docs.rs/rtrb/0.4.0/rtrb/.
