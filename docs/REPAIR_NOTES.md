# 0.2.0 repair and Audio Lab notes

Based on upstream commit f6b7459b0de035f7431b47f45d4abea7d2023493.

## Repairs

- Restored valid Windows/macOS icons; corrected MSVC/CMake/CRT builds in the vendored rack adapter and pinned the SDK fetch.
- Updated JavaScript dependencies, Tailwind and vulnerable Rust TLS dependencies. Fonts are bundled for offline use; skin images are included in production output.
- Added schema 9 project identities, bounded input validation, atomic project/WAV writes, backups and safe recovery destinations. Recovery no longer inherits another project's save path.
- Replaced whole-project overwrite calls with explicit baseline three-way patches. Serialized client edits preserve unrelated simultaneous changes. Render operations reload authoritative state.
- Restricted external plugin paths to a locally approved scan catalog. Project files cannot authorize native plugin libraries.
- Added persistent native output and independent deck clocks, continuous looping, phase-aware sync, start offsets, asynchronous arrangement refresh and audio-error reporting.
- Corrected include-muted exports, freeze mixer controls, pre-fader sends, comp interval replacement and render-in-place splitting. Added WSOLA warp/stretches and short-file waveforms.
- Recording acknowledges device startup, supports native integer/float formats, bounds the callback queue and incrementally writes WAV data. Fixed count-in cancellation and protected project switches during active capture.
- Blackout/panic blocks cue dispatch, forces zero DMX payloads and propagates output errors. Sequence beat zero fires on start.
- Added the integrated Audio Lab and a local Rust CLI/browser bridge for deterministic verification.

## Validation

Run `npm ci`, `npm run lint`, `npm run build`, `npm test` and `npm run test:native`. The completed Windows verification passed 59 native tests and 4 recording-store regressions. Production build, lint, NSIS packaging and a native desktop launch/clean-close smoke check passed. Native tests cover render/export parity, automation, deck loops/sync, project persistence/merge, blackout, recording placement, waveform buckets and lab DSP. Browser verification uses real Rust decoding/analysis/processing through a local adapter; it does not simulate hardware audio or replace native desktop acceptance.

For repeatable UI verification, build the optional CLI with `npm run build:bridge`, then `npm run test:bridge`. Only the serve-only plugin under explicit `DECK_TEST_BRIDGE=1` injects the bridge; production builds contain no test IPC endpoint.

## Remaining acceptance work

Listen to playback and record a test take using the intended devices; verify the chosen drivers, actual latency and routing. Scan and load the intended third-party VSTs and exercise their editors/automation. Test OSC/MIDI/Art-Net against the venue hardware. Linux/macOS builds and signed distribution have not been verified here. VST processing remains in-process and arrangement edits render buffers; full streaming plugin processing, calibrated true-peak metering, independent deck pitch lock and portable project media packaging remain future work.

## Dependency audit scope

The npm lockfile audit reports zero advisories. A separate RustSec/Cargo.lock range comparison removed the prior rustls and webpki matches, but still reports maintenance notices in transitive packages and target-specific issues in glib, rand 0.7 and quick-xml. quick-xml does not appear in the Windows target graph. This comparison is not a cargo-audit certificate or proof of reachability; cross-platform dependency acceptance remains open.
