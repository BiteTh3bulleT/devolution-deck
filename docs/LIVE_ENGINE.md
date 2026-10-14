# Live DJ and stage engine — v0.6

The user-selected lead workflow is live DJ and stage performance. A full professional DAW remains a multi-release program; v0.4 establishes an inspectable native output boundary and cue routing.

## Implemented

CPAL owns a persistent output stream on a dedicated producer thread. Its hardware callback consumes a fixed-capacity rtrb queue and uses atomics for transport state and counters. It does not decode files, render projects, wait on a mutex, allocate/free heap memory, perform disk I/O, or log. Queue capacity is 8192 frames. Queue target adapts to twice the requested or observed device callback size, capped at 4096 frames. Stale frames are rejected after seeks, source replacement and Stop. The callback publishes the consumed arrangement position.

Native stereo/mono and signed/unsigned integer/float device formats are supported. Device rate conversion runs on the producer, using linear interpolation from the current 48 kHz internal engine. System exposes device/rate/requested buffer, main and headphone cue channel pairs, cue gain, observed callback size, queue depth, underruns, invalid samples, device errors, clipping and callback timing. The latency value is a buffered-output estimate, excluding hardware and capture latency. It is not a measured round-trip value. Windows currently uses the CPAL default WASAPI host; ASIO is not implemented.

Output settings persist atomically in LOCALAPPDATA/devolution-deck/audio-output.json. A missing saved device produces an explicit error; startup does not silently route to another named device. Settings apply only while playback and recording are stopped. An unsuccessful replacement keeps the previous driver/settings. The app remains available when output initialization fails.

Two decks can feed the independent stereo cue bus before their crossfader gain. Cue requires a separate hardware pair on the same multichannel device. Unassigned channels remain silent. Project schema 10 stores each deck's cue switch and migrates older projects with cue off. No cue is sent to the main pair when a device only has two channels.

Arrangement preparation happens off the Tauri UI task. Native start tickets ensure Stop, project changes and newer starts invalidate older render results. Frontend transport tracks starting/playing/stopped and rejects stale asynchronous replies. Audio Stop dispatches before recorded-take finalization. Floating-point track/master rendering retains headroom; the hardware conversion clamps its outgoing samples and reports clipping.

## Boundaries still to replace

Arrangement playback is still rendered into a whole buffer before starting. Project refresh still re-renders it. Deck assets are fully decoded/cached. Deck positions now come from frames consumed at the hardware callback boundary rather than the producer. The device itself can add further hardware latency. The shared stage/MIDI/lighting scheduler is not yet a sample-accurate engine clock. Persistent DSP/VST graph processing, plugin latency compensation and plugin crash isolation remain future work. Existing deck pitch-lock/filter preferences are not evidence of implemented independent time-stretch/filter DSP. Input software monitoring is explicitly marked planned. Current device conversion uses linear resampling, not a mastering-grade bandlimited resampler.

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


## v0.6 consumed performance clock

The callback publishes a coherent generation-stamped snapshot: cumulative consumed source-engine frames, source position, both deck positions/playing flags, and main/cue peak levels after output clipping/routing gain. The internal source rate is 48 kHz. This source clock advances on valid played source frames, continues across loop wraps and source changes, and stops advancing on starvation or Stop. It is not a wall clock and does not yet schedule MIDI or lighting events. Device rate conversion propagates source-frame metadata; it does not imply a high-quality resampler.

A single callback writer publishes atomic fields using a sequence stamp. Readers make at most three snapshot attempts and reject a changed/odd stamp; neither the callback nor readers wait on a telemetry mutex. Snapshot generations reject obsolete timing after seek/source changes. Deck command preparation and project_get now use callback-consumed positions. The deck view polls a compact telemetry endpoint at 50 ms with one in-flight request, rather than loading the entire project every 250 ms. Display refresh still depends on IPC/UI scheduling; this does not make user-interface events sample-accurate.

Main/cue meters represent the peak within the last delivered callback. Mono main peaks account for downmix cancellation. Stopped output shows zero peaks. The existing callback allocation guard remains in place; concurrent snapshot consistency, queued-versus-consumed positions, generation invalidation, final silent frame accounting, and prefetch discard/clock continuity have regression coverage.

Next: bounded sample-time commands and master beat scheduling, live block DSP and disk streaming, then controller/recovery qualification. The previously listed DAW limitations remain.


Source changes now wait for a complete callback packet before priming, using a retained frame and fixed-capacity queue. This deliberately adds startup/prefill delay rather than starting a partial packet. Once primed, missing frames remain counted as underruns. A generation change during a callback silences its remainder before the new source is primed. It does not add click-free gain smoothing or in-place DSP updates; those remain follow-up work.

The first 30-second silent two-deck hardware run exposed one startup underrun of 280 frames. After the prefill fix, the repeat delivered 2999 callbacks with zero underruns, invalid or clipped samples. Both independent deck loops remained active and the consumed source clock reached 1,439,520 frames. This is a short silent run on one WASAPI device, with cue disabled at hardware output; it does not qualify sustained real-track DJ use or physical headphone routing. UI clock/meter screenshots use explicitly intercepted fixture responses and are separate from this native device test.


Crossfader and headphone-cue gain changes now update matching cached deck sources in place. They preserve producer cursors and clock generation instead of flushing/restarting the queue. Their effect arrives after the already-queued frames and producer block. This does not yet implement gain smoothing; click-free parameter ramps are part of the live DSP milestone. A regression test verifies unchanged cursor/generation with changed main/cue gains.

## v0.7 beat cues, persistent deck DSP and touch layout

Deck hot cues can run immediately or be queued to the master's next beat, four-beat bar or eight-beat boundary. A fixed 32-slot queue schedules source-engine frames during native sample rendering; the deadline uses the next unrendered master source position, configured BPM and playback speed. Already buffered audio is respected. Stop, seek and source generation changes cancel pending actions. Invalid cues, absent/stopped masters, targets outside active loops, unreachable end-of-track deadlines and master loops wrapping before the requested boundary are rejected. The grid starts at source time zero; beat-grid offset editing is still future work. Quantized launches are audio-only: they do not dispatch lighting/show bindings ahead of playback. Immediate launches retain existing show bindings.

Each deck now has persistent stereo one-pole low-pass/high-pass filters, with an exact neutral bypass. Main and headphone gains, filter amount and cutoff coefficients ramp over 960 source frames (20 ms). Crossfader, cue, gain and filter changes reuse source cursors and DSP state. Processing runs on the producer before routing; the device callback remains a bounded frame copier without DSP, locks or allocations. Parameter changes arrive after queued audio. This is the deck DSP foundation; full streaming arrangement/plugin graphs, delay compensation, additional effects and disk streaming remain future work. Scheduled source jumps can still click; this release does not claim continuous vinyl emulation or seek crossfades.

Deck mode starts with the touch layout enabled. It hides side panels, enlarges the Blender platters to 320–440 CSS pixels, and gives controls a 48-pixel minimum target. Studio panels can be restored with the layout toggle. Each control captures its own pointer ID; two decks can receive independent touches. Knob previews update locally, emissions are throttled, and each deck's pending gain/filter patches are coalesced with only one request in flight. Jog gestures remain release-based scratch/nudge commands, with sensitivity normalized to platter width and keyboard support retained.

Verification: 94 native tests and 13 frontend tests pass, including exact sample boundary execution, prefetch deadline invariance, queue capacity/cancellation, loop/end guards, filter attenuation, gain ramps and simultaneous parameter lanes. Production assets are verified after every build. The release executable is also checked for embedded copies of all nine v5 artwork/control PNGs and the touch/alien stylesheet. Native visual interaction and sustained non-silent hardware playback were not verified in the current sandbox; this milestone is not stage qualification.
