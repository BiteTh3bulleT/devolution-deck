# DEVOLUTION//DECK

**Phase 1 — Core desktop DAW foundation for DJ Devooo.**

A dark, premium, artist-driven desktop music platform for EDM production, future DJ performance, and eventual lighting/show-control integration.

---

## 1. Executive Summary

DEVOLUTION//DECK Phase 1 delivers a **buildable vertical slice** of a real desktop DAW:

- **Native shell**: Tauri 2 desktop app with resizable window.
- **UI**: Premium dark command-center layout (transport bar, sidebar, arrangement timeline, utility panel).
- **Transport**: Play, stop, timeline position display, BPM placeholder, project title, save/open/import.
- **Timeline**: Horizontal ruler, track lanes, draggable playhead, clip blocks with **real** waveform rendering from imported audio.
- **Audio**: Import local audio (WAV, MP3, FLAC, etc.), store metadata, place clips on tracks, play/stop/seek with backend sync.
- **Project**: Save/load `.deck` project files (JSON), persisting tracks, media references, and clip placement.
- **Architecture**: Clear domains (app shell, transport, timeline, track, clip, media, project I/O, audio playback, waveform), typed models, and room for Phase 2 (MIDI, mixer, plugins, DJ deck, show control).

The codebase is modular, typed, and production-minded — no mock data or fake waveforms.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (React + TypeScript + Zustand)                          │
│  ┌─────────────┐ ┌─────────────────────────────────────────────┐ │
│  │ TransportBar│ │ Timeline (ruler + tracks + clips + playhead)  │ │
│  └─────────────┘ └─────────────────────────────────────────────┘ │
│  ┌─────────────┐ ┌─────────────────────┐                       │
│  │ Sidebar     │ │ UtilityPanel         │                       │
│  │ (media/tracks)│ │ (inspector placeholder)│                     │
│  └─────────────┘ └─────────────────────┘                         │
│  Stores: projectStore | transportStore | viewStore               │
│  API layer: invoke(tauri commands)                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ invoke
┌─────────────────────────────────────────────────────────────────┐
│  Backend (Rust / Tauri)                                          │
│  Commands: project_* | media_import_audio | waveform_peaks |      │
│            track_add | clip_place | playback_*                    │
│  Domains: models (Project, Track, Clip, MediaAsset)               │
│           project_io (save/load JSON)                             │
│           audio (PlaybackHandle thread, waveform peaks via Symphonia)│
└─────────────────────────────────────────────────────────────────┘
```

- **Single source of truth**: Project state lives in Rust; frontend loads/saves via commands.
- **Playback**: Dedicated thread owns rodio/cpal (not `Send` on all platforms); frontend polls position for playhead.
- **Waveforms**: Symphonia decodes audio → peak buckets → frontend draws in canvas per clip.

---

## 3. Folder / Repo Tree

```
DevoDeck/
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── types/
│   │   └── index.ts          # Project, Track, Clip, MediaAsset, WaveformPeaks
│   ├── api/
│   │   └── index.ts           # invoke wrappers for all commands
│   ├── stores/
│   │   ├── projectStore.ts
│   │   ├── transportStore.ts
│   │   └── viewStore.ts
│   └── components/
│       ├── TransportBar.tsx
│       ├── Sidebar.tsx
│       ├── Timeline.tsx
│       ├── TimelineRuler.tsx
│       ├── TrackLane.tsx
│       ├── ClipBlock.tsx
│       ├── WaveformCanvas.tsx
│       ├── Playhead.tsx
│       └── UtilityPanel.tsx
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── capabilities/
│   │   └── default.json
│   ├── icons/
│   │   ├── 32x32.png
│   │   ├── 128x128.png
│   │   └── 128x128@2x.png
│   └── src/
│       ├── main.rs
│       ├── lib.rs
│       ├── commands.rs        # All Tauri commands + AppState
│       ├── project_io.rs      # save_project / load_project
│       ├── models/
│       │   ├── mod.rs
│       │   ├── project.rs     # Project, Track, TimelineClip, MediaAsset
│       │   └── transport.rs   # TransportState (ephemeral)
│       └── audio/
│           ├── mod.rs
│           ├── playback.rs    # PlaybackHandle, thread + channel
│           └── waveform.rs    # compute_waveform_peaks (Symphonia)
└── README.md (this file)
```

---

## 4. Technology Decisions and Why

| Choice | Reason |
|--------|--------|
| **Tauri 2** | Native desktop shell, small binary, Rust backend, secure IPC. |
| **React + TypeScript** | Strong typing, component model, broad ecosystem. |
| **Tailwind** | Tokenized design (deck-* colors), fast iteration, no design-system lock-in. |
| **Zustand** | Lightweight stores, no boilerplate, good for transport/project/view. |
| **Rust backend** | Audio decode (Symphonia), playback (rodio), file I/O, future MIDI/plugins. |
| **Symphonia** | Format-agnostic decode (WAV, MP3, FLAC, etc.) for waveform + metadata. |
| **rodio** | Simple playback; run on dedicated thread so non-`Send` types stay off Tauri State. |
| **JSON project file** | Human-readable, versioned schema, easy to extend (Phase 2). |
| **Waveform buckets** | Decode once, send min/max per column; frontend draws with canvas for performance. |

---

## 5. Data Model Definitions

- **Project**: `version`, `title`, `bpm`, `sample_rate`, `media[]`, `tracks[]`.
- **MediaAsset**: `id`, `name`, `path`, `duration_secs`, `sample_rate`, `channels`.
- **Track**: `id`, `name`, `index`, `clips[]`.
- **TimelineClip**: `id`, `media_asset_id`, `start_secs`, `source_offset_secs`, `duration_secs`.
- **TransportState** (ephemeral): `Stopped | Playing`; position derived from playback thread.
- **ViewState**: `pixelsPerSec`, `scrollLeft`, `trackHeaderWidth`, `rulerHeight`, `trackHeight`.

---

## 6. Phase 1 UI Layout Plan

- **Top**: Transport bar — play, stop, position, BPM, title, New / Open / Save / Import.
- **Left**: Sidebar — Media list (imported files), Tracks list, “Add track”.
- **Center**: Timeline — ruler (time), track lanes, clip blocks with waveforms, playhead overlay.
- **Right**: Utility panel — inspector (project info, track/media counts), placeholder for mixer/editor.

Colors: graphite/near-black base; violet/cyan/magenta/amber accents; subtle glow on playhead.

---

## 7. Rust Backend Design

- **commands.rs**: AppState holds `project`, `project_path`, `playback` (PlaybackHandle). Commands: `project_new`, `project_save`, `project_open`, `project_get`, `project_update`, `media_import_audio`, `waveform_peaks`, `track_add`, `clip_place`, `playback_play`, `playback_stop`, `playback_position_ms`, `playback_is_playing`.
- **project_io.rs**: Serde JSON; schema version check on load.
- **audio/playback.rs**: Spawned thread with rodio OutputStream; mpsc for Play/Stop; Arc<AtomicU64> for position_ms.
- **audio/waveform.rs**: Symphonia probe + decode → per-bucket min/max → WaveformPeaks.

---

## 8. Frontend React Design

- **App**: Shell layout; loads project on mount.
- **TransportBar**: New, Open, Save, Import (dialog), Play (first clip), Stop, position, BPM, title.
- **Sidebar**: Media list from project.media; Add track; track names.
- **Timeline**: Ruler (time ticks), list of TrackLane; each lane has ClipBlocks; Playhead absolutely positioned.
- **ClipBlock**: Fetches waveform_peaks for asset path, draws via WaveformCanvas (canvas 2D).
- **UtilityPanel**: Project/track/media counts; future mixer/editor placeholder.

---

## 9. State Management Plan

- **projectStore**: project, projectPath, load/new/open/save, error.
- **transportStore**: status, positionSecs, play/stop, position poll (setInterval).
- **viewStore**: pixelsPerSec, scrollLeft, trackHeaderWidth, rulerHeight, trackHeight, zoom.

Project and transport are synced from backend (load after mutations; position poll when playing).

---

## 10. File Import / Project Persistence Strategy

- **Import**: Dialog (audio extensions) → for each path: `media_import_audio` (decode + metadata, append to project.media). If no track, `track_add`; then `clip_place` on track 0 at next free time. Then frontend `load()`.
- **Save**: If projectPath set, save there; else save dialog. Backend `project_save(path)` writes JSON.
- **Open**: Open dialog (.deck) → `project_open(path)` → set project + projectPath.
- **Project file**: JSON with version; paths stored as provided (absolute or relative TBD for portability). Missing files: graceful error (Phase 1: show error; future: relink).

---

## 11. Setup Instructions

- **Prerequisites**: Node 18+, Rust (stable), system deps for Tauri (e.g. Linux: `libwebkit2gtk`, `libgtk-3`, etc. per [Tauri docs](https://v2.tauri.app/start/prerequisites/)).
- Clone/navigate to repo:
  ```bash
  cd DevoDeck
  ```
- Install frontend:
  ```bash
  npm install
  ```
- Icons: Placeholder PNGs exist in `src-tauri/icons/`. Replace with real app icon later (e.g. `npm run tauri icon` with a source image).

---

## 12. Run Instructions

- **Development** (Vite dev server + Tauri window):
  ```bash
  npm run tauri dev
  ```
- **Production build** (bundle: deb, rpm, AppImage on Linux):
  ```bash
  npm run build
  env -u CI npm run tauri build
  ```
  (If your environment sets `CI=1`, unset it so Tauri doesn’t treat the build as CI.)
- **Frontend only** (no backend):
  ```bash
  npm run dev
  ```
  (Then open http://localhost:5173; backend commands will fail unless run in Tauri.)

---

## 13. Phase 1 Validation Checklist

- [x] Desktop app shell opens (Tauri).
- [x] Transport bar: play, stop, position, BPM, title, New / Open / Save / Import.
- [x] Sidebar: media list, add track, track names.
- [x] Timeline: ruler, track lanes, clip blocks, playhead.
- [x] Import audio: dialog → backend import → media in list, clip on track 0.
- [x] Waveform: real peaks from file, drawn in clip blocks.
- [x] Play: first clip plays; stop works; position updates playhead.
- [x] Save/Open: project JSON persists tracks, media, clips.
- [x] Error handling: invalid import / missing file handled without crash; user feedback.
- [x] Layout: dark theme, readable, professional.

---

## 14. Known Limitations

- **Playback**: Single clip at a time; no multi-track mix, no sync to timeline start (playback starts from first clip’s asset).
- **Seek**: Position is from playback start; no user scrub/seek to arbitrary time yet.
- **Clip placement**: Auto-placed on import (track 0, sequential); no drag-to-place in UI yet.
- **Project paths**: Stored as given; moving project file can break media paths (relink not implemented).
- **Waveform**: Computed on demand per clip; no persistent cache (recomputed on zoom/resize).

---

## 15. Recommended Phase 2 Expansion Path

1. **Timeline**: Scrub/seek, drag playhead, snap.
2. **Clips**: Drag from media to track; trim handles; source offset in UI.
3. **Multi-track playback**: Mix multiple clips (engine or mixer abstraction).
4. **MIDI**: MIDI track type, editor, clip model.
5. **Mixer**: Level/pan, routing, groups.
6. **Plugins**: Plugin host abstraction (VST/CLAP bridge or internal).
7. **DJ deck mode**: Deck UI, crossfader, cue.
8. **Show/light**: Sync protocol, BPM link, scene triggers.

---

## License

Proprietary / as specified by project owner.
