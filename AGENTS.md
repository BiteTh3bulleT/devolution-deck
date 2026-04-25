# DEVOLUTION//DECK Agent Operating Doctrine

This file is the canonical repo-wide instruction set for AI agents, Codex sessions, Cursor passes, and human-assisted automation working on DEVOLUTION//DECK.

## Mission

DEVOLUTION//DECK is a native desktop music platform for EDM production, DJ performance, and eventual lighting/show-control integration.

The current app is a Phase 1 Tauri + React + Rust vertical slice. The next major goal is to turn it from a waveform file arranger into a timeline-native audio workstation.

## Non-Negotiable Architecture

1. The Rust backend owns project truth, project mutation, file I/O, audio scheduling, validation, and persistence.
2. The React frontend owns interaction, display, user intent capture, and editor ergonomics.
3. The timeline is the core domain. Playback must eventually obey timeline position, tracks, clips, offsets, fades, mute/solo, loops, and seeks.
4. Do not build a parallel project state system in the frontend.
5. Do not store canonical project data in localStorage, component state, or frontend-only caches.
6. Do not let UI convenience mutate project shape without a backend command or validated action path.
7. Do not add plugin hosting before the internal mixer, clock, scheduler, and render path exist.
8. Do not widen Tauri permissions to solve local development friction.
9. Do not introduce network services, telemetry, cloud sync, or external APIs without an explicit design note.

## Current Stack

- Desktop shell: Tauri 2
- Frontend: React, TypeScript, Vite, Tailwind, Zustand
- Backend: Rust
- Audio decode/waveform: Symphonia
- Basic playback: rodio
- Project format: JSON `.deck`

## Repo Shape

- `src/` contains the frontend application.
- `src/api/` contains Tauri invoke wrappers.
- `src/stores/` contains lightweight UI/client state stores.
- `src/components/` contains the editor shell and timeline UI.
- `src-tauri/src/` contains backend commands, models, project I/O, and audio code.
- `docs/` contains planning, architecture, quality, roadmap, and prompt material.

## Build and Validation Expectations

Before claiming work is complete, run the strongest available checks for the touched area.

Frontend:

```bash
npm install
npm run build
```

Backend:

```bash
cd src-tauri
cargo fmt --check
cargo clippy -- -D warnings
cargo test
```

Full desktop smoke test:

```bash
npm run tauri dev
```

If a check cannot be run, state exactly why and list the command that should be run by the next operator.

## Coding Standards

### TypeScript / React

- Keep domain types aligned with Rust models.
- Prefer narrow Zustand selectors over broad store reads.
- Keep Tauri invoke wrappers in `src/api/`.
- Do not call Tauri commands directly inside deeply nested components unless the command is strictly UI-local.
- Use accessible button labels, titles, disabled states, and keyboard affordances.
- Avoid hard-coded magic values in components when they belong in view/domain config.

### Rust

- Keep backend commands thin. Domain logic should move into modules.
- Validate all inbound command payloads.
- Prefer explicit domain errors over raw strings as the project matures.
- Keep audio-thread ownership clear. Do not move non-Send rodio/cpal internals into global state.
- Do not hold mutex locks while performing slow decode, file, or playback work.
- Add tests for project mutation and persistence logic.

### Audio Rules

- Timeline position is seconds for UI readability, but engine internals should move toward sample-accurate scheduling.
- Never assume a clip begins at timeline zero.
- Never assume there is only one clip.
- Never assume there is only one track.
- Never assume source offset is zero.
- Never recompute expensive waveform data on every render path when it can be cached.

## Required Design Direction

The next serious milestone is a timeline-native engine:

- Project command/action model
- Undo/redo
- Timeline seek/scrub
- Clip drag/trim/split
- Mixer primitives
- Track mute/solo/volume/pan
- Multi-track scheduler
- Waveform cache
- Project relink/autosave
- Security hardening

## What Not To Do

- Do not replace the stack casually.
- Do not rewrite the app into Electron.
- Do not move canonical truth to React state.
- Do not fake playback with UI-only position updates.
- Do not add decorative UI features before timeline editing and playback truth are correct.
- Do not add AI branding, chat surfaces, or unrelated automation into this repo.
- Do not output large code blocks in chat when working through Codex/Cursor. Patch files directly.
- Do not claim production readiness without build, test, and smoke validation.

## Completion Report Format

Every agent pass should end with:

1. Files changed
2. Behavior changed
3. Validation run
4. Validation not run, if any
5. Known risks
6. Next recommended step
