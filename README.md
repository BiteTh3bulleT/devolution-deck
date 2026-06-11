# DEVOLUTION//DECK

Desktop music production, DJ performance, and show-control workstation for DJ Devooo.

DEVOLUTION//DECK is a Tauri 2 desktop app with a React/TypeScript frontend and a Rust backend. The current build has moved beyond the original Phase 1 DAW slice and now includes arrangement editing, MIDI tools, recording, rendering, deck performance workflows, show-control integrations, app recovery, diagnostics, and release-readiness operations.

## Current Capabilities

- Native desktop shell through Tauri 2.
- Dark command-center UI with transport, sidebar, arrangement timeline, utility panels, deck/show modes, and status surfaces.
- Project lifecycle for `.deck` JSON files with schema migration, compatibility checks, backups, recovery snapshots, and support bundle export.
- Audio import, waveform peak generation, clip placement, realtime arrangement playback, loop regions, recording, render-in-place, freeze, mixdown export, and stem export.
- MIDI tracks, piano roll, drum sequencer, Web Audio MIDI playback, quantize tools, metronome, and basic instrument assignments.
- Mixer, sends, return/bus routing, sidechain routes, automation lanes, comping, warp/slicing, sample tagging, and template application.
- DJ deck mode with real Deck A/B audio playback, cues, loops, crossfader, sampler pads, library crates, setlists, and live coordination panels.
- Show-control foundation for OSC, MIDI, DMX/Art-Net, lighting cue bindings, scene triggers, visual sync, and performance macro workflows.
- Assistant and ops panels for asset classification, release checks, error reports, diagnostics, onboarding, branding, shortcuts, and system health.

## Architecture

```text
Frontend: React + TypeScript + Zustand + Tailwind
  src/
    api/              Tauri invoke wrappers
    components/       Studio, deck, show, utility, MIDI, render, ops UI
    data/             Project templates
    services/         Web Audio metronome, MIDI sequencer, automation helpers
    stores/           Project, transport, MIDI, recording, deck, show state
    types/            TypeScript models aligned with Rust models

Backend: Rust + Tauri
  src-tauri/src/
    commands.rs       Tauri command surface and app state orchestration
    models/           Project schema and domain models
    audio/            Playback, waveform, recording, render, VST host foundation
    deck.rs           Deck analysis and performance helpers
    show_control.rs   OSC, MIDI, DMX/Art-Net dispatch helpers
    project_io.rs     Project save/load
    recovery.rs       Recovery snapshot management
    assistant.rs      Assistant-related project operations
    plugin_host.rs    Plugin discovery/host foundation
```

Rust remains the source of truth for persisted project state. The frontend mirrors state through Zustand stores and refreshes via Tauri commands after mutations.

## Prerequisites

- Node.js 18 or newer.
- Rust stable.
- Platform requirements for Tauri 2. On Linux this includes WebKit/GTK packages listed in the Tauri prerequisites.
- Audio/MIDI devices are optional for development, but hardware-specific flows need matching local devices.

## Install

```bash
npm install
```

## Development

Run the Tauri app:

```bash
npm run tauri:dev
```

Run only the Vite frontend:

```bash
npm run dev
```

The frontend-only server is useful for UI work, but Tauri commands will fail outside the desktop runtime.

## Build And Verification

Frontend production build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

Rust checks:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

Tauri production bundle:

```bash
npm run tauri:build
```

Release candidate bundle:

```bash
npm run release:rc
```

If your environment sets `CI=1` and Tauri treats it too strictly for a local desktop bundle, run with `env -u CI npm run tauri:build`.

## Project Files

`.deck` files are JSON project documents. They store media references, tracks, clips, MIDI notes, session state, routing, show-control configuration, release settings, and recovery metadata. Media paths are still stored as file paths, so moving media outside the expected location may require relinking.

## Devooo UI Asset Packs

Transparent PNG skin assets live under `src/assets/ui/devooo/` by tab or shared surface:

```text
controls/     Shared fields, chips, buttons, toggles, and slider slots
utility/      Utility tab button states
inspector/    Inspector shell, stat rows, instrument cards, warp/slicing, empty states
mixer/        Mixer shell, channel strips, meters, faders, sends, routing, buttons
```

Future tab packs should use the same folder pattern. Placeholder directories already exist for plugins, automation, render, comping, system, shortcuts, assistant, dashboard, performance, show, ops, branding, and templates. Preview sheets and asset-pack manifests are source references only and should not be imported by runtime UI.

## Repo Hygiene

- `node_modules/`, `dist/`, `src-tauri/target/`, logs, env files, and TypeScript build-info files are ignored.
- Generated Tauri schemas live under `src-tauri/gen/` and are kept in the repo because Tauri updates them alongside capability changes.
- Run `npm run build`, `npm run lint`, `cargo check --manifest-path src-tauri/Cargo.toml`, and `cargo test --manifest-path src-tauri/Cargo.toml` before publishing.

## Known Limitations

- Deck playback currently renders finite buffers when deck state changes; long-running continuous deck streaming, independent pitch lock, and deck-specific meters are still evolving.
- Plugin hosting is a foundation layer, not a production-grade VST/CLAP sandbox.
- MIDI and metronome playback use Web Audio for audible feedback and are not a low-latency professional MIDI/audio engine yet.
- Show-control integrations can dispatch OSC, MIDI, and Art-Net packets, but real venue/hardware validation is still required.
- Media portability depends on stored paths; robust relink/package workflows are still evolving.
- Automated Rust tests now cover engine mixdown, mixer policy, meters, stereo rendering, automation, plugin preflight, MIDI synthesis, and deck mix behavior.

## License

Proprietary / as specified by project owner.
