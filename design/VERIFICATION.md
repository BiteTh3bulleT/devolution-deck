# UI release verification / 0.3.0

Verified on Windows x64 on October 13, 2026. Assets were generated with the built-in imagegen tool and Blender 5.2.0 LTS/Cycles. All seven rendered control assets are RGBA PNGs, with editable source scenes in `design/blender/devolution-controls.blend`.

Passed checks:

- TypeScript/Vite production build and ESLint.
- 59 Rust native regression tests and 4 recording-store regressions.
- Separate headless verification CLI builds with version 0.3.0.
- Knob vertical drag changes gain by the expected amount; keyboard arrows adjust it; double-click returns it to its default.
- Jog keyboard actions send the intended quarter-beat native nudge payload. Pointer release sends a nudge in normal mode and a scratch in vinyl mode. These IPC checks intercept responses in the browser fixture; hardware playback was not exercised.
- Studio, session, decks, stage and audio lab rendered in the browser using explicit fixture data and real Rust analysis/waveform data.
- Control-rack and show safety layout visually checked at 1000 × 700; console and lab checked at 1440 × 1000.
- NSIS Windows installer built successfully. Packaged desktop executable launched, stayed responsive and closed normally with no stderr output.
- Production JavaScript contains no local verification IPC endpoint. Fonts, textures and control assets are bundled.

Reproduce UI previews with `npm run build:bridge`, `npm run test:bridge`, then (in a second terminal) `node scripts/seed-ui-fixture.mjs`. The fixture creates four named tracks and two loaded decks referencing a generated test tone. It is deliberately separate from production startup and does not become user project data.

The previous release's hardware/VST/venue acceptance limits remain. The interface update is verified against software and visual flows, without microphone capture or live venue transmission.
