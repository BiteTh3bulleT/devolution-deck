//! Project save/load. JSON format with schema version for future compatibility.

use crate::models::{Project, PROJECT_SCHEMA_VERSION};
use std::fs;
use std::io::Write;
use std::path::Path;

/// Serialize project to JSON and write to path.
pub fn save_project(project: &Project, path: &Path) -> Result<(), String> {
    validate_project(project)?;
    let json = serde_json::to_string_pretty(project).map_err(|e| e.to_string())?;
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temporary
        .write_all(json.as_bytes())
        .map_err(|e| e.to_string())?;
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    if path.exists() {
        let backup = path.with_extension("deck.bak");
        fs::copy(path, backup).map_err(|e| format!("Could not preserve backup: {e}"))?;
    }
    temporary.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Schema migrations
//
// IMPORTANT: Migrations must only set NEW fields introduced in that schema
// version. They must NEVER overwrite fields that existed in previous versions
// (e.g. volume_db, pan, muted, solo). Serde #[serde(default)] on struct fields
// ensures that missing fields in old JSON files are filled with defaults during
// deserialization, so migrations only need to bump the version number and
// initialise project-level fields that have no serde(default) coverage.
// ---------------------------------------------------------------------------

/// Migrate a v1 project to v2 in-place.
/// v2 added: track_type, midi_clips, instrument, loop_region.
/// All new track fields have #[serde(default)] so they are already set.
fn migrate_v1_to_v2(mut project: Project) -> Project {
    project.version = 2;
    // track_type defaults to Audio, midi_clips to vec![], instrument to None via serde(default)
    // loop_region defaults to None via serde(default)
    project
}

/// Migrate a v2 project to v3 in-place.
/// v3 added: session, automation_lanes, routing, browser_index, templates.
fn migrate_v2_to_v3(mut project: Project) -> Project {
    project.version = 3;
    // All new fields use serde(default) — no overwrites needed.
    project
}

/// Migrate a v3 project to v4 in-place.
/// v4 added: plugin_registry, sidechain_routes, render_jobs, recovery_snapshots,
/// shortcuts, monitoring, autosave_interval_secs, track-level plugin_chain/freeze_state/take_lanes/comp_regions/armed.
fn migrate_v3_to_v4(mut project: Project) -> Project {
    project.version = 4;
    // All new fields use serde(default) — no overwrites needed.
    project
}

/// Migrate a v4 project to v5 in-place.
/// v5 added: asset_classifications, dashboard_widget_state, performance_mode,
/// performance_macros, scene_triggers, show_cues, lighting_cue_bindings, visual_sync, branding.
fn migrate_v4_to_v5(mut project: Project) -> Project {
    project.version = 5;
    // All new fields use serde(default).
    project
}

/// Migrate a v5 project to v6 in-place.
/// v6 added: library_items, crates, decks, deck_sync, crossfader,
/// sampler_slots, performance_pads, setlists, show_triggers, deck_event_bindings, deck_scene_links.
fn migrate_v5_to_v6(mut project: Project) -> Project {
    project.version = 6;
    // Decks need special initialisation if empty (default project creates 2 decks)
    if project.decks.is_empty() {
        project.decks = Project::default().decks;
    }
    project
}

/// Migrate a v6 project to v7 in-place.
/// v7 added: show_project.
fn migrate_v6_to_v7(mut project: Project) -> Project {
    project.version = 7;
    // show_project uses serde(default).
    project
}

/// Migrate a v7 project to v8 in-place.
/// v8 added: unified navigation/preferences/diagnostics/release readiness domains.
fn migrate_v7_to_v8(mut project: Project) -> Project {
    project.version = 8;
    // All new fields use serde(default).
    project
}

/// Maximum project file size: 50 MB.
const MAX_PROJECT_FILE_SIZE: u64 = 50 * 1024 * 1024;

/// Read project from JSON file. Migrates older schemas as needed.
pub fn load_project(path: &Path) -> Result<Project, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    if metadata.len() > MAX_PROJECT_FILE_SIZE {
        return Err(format!(
            "Project file too large ({:.1} MB, max {} MB)",
            metadata.len() as f64 / (1024.0 * 1024.0),
            MAX_PROJECT_FILE_SIZE / (1024 * 1024)
        ));
    }
    let contents = fs::read_to_string(path).map_err(|e| e.to_string())?;
    // Use a loose Value first to read the version without full schema constraints.
    let value: serde_json::Value = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
    let file_version = u32::try_from(value.get("version").and_then(|v| v.as_u64()).unwrap_or(1))
        .map_err(|_| "Invalid schema version")?;

    if file_version > PROJECT_SCHEMA_VERSION {
        return Err(format!(
            "Project schema v{} is newer than supported v{}",
            file_version, PROJECT_SCHEMA_VERSION
        ));
    }

    let mut project: Project = serde_json::from_value(value).map_err(|e| e.to_string())?;

    if file_version < 2 {
        project = migrate_v1_to_v2(project);
    }
    if file_version < 3 {
        project = migrate_v2_to_v3(project);
    }
    if file_version < 4 {
        project = migrate_v3_to_v4(project);
    }
    if file_version < 5 {
        project = migrate_v4_to_v5(project);
    }
    if file_version < 6 {
        project = migrate_v5_to_v6(project);
    }
    if file_version < 7 {
        project = migrate_v6_to_v7(project);
    }
    if file_version < 8 {
        project = migrate_v7_to_v8(project);
    }
    if file_version < 9 {
        project.version = 9;
        for track in &mut project.tracks {
            for clip in &mut track.clips {
                if let Some(warp) = &mut clip.warp {
                    warp.algorithm = "wsola".into();
                }
            }
        }
    }

    validate_project(&project)?;
    Ok(project)
}

pub fn validate_project(project: &Project) -> Result<(), String> {
    if !project.bpm.is_finite() || !(20.0..=400.0).contains(&project.bpm) {
        return Err("Tempo must be between 20 and 400 BPM".into());
    }
    if !(8000..=192000).contains(&project.sample_rate) {
        return Err("Sample rate must be between 8 and 192 kHz".into());
    }
    if project.tracks.len() > 128 || project.media.len() > 4096 {
        return Err("Project exceeds track/media limits".into());
    }
    let mut end = 30.0f64;
    let mut ids = std::collections::HashSet::new();
    for track in &project.tracks {
        if !ids.insert(&track.id) {
            return Err("Duplicate track ID".into());
        }
        if !track.volume_db.is_finite() || !track.pan.is_finite() {
            return Err("Invalid mixer value".into());
        }
        for (start, duration) in track
            .clips
            .iter()
            .map(|c| (c.start_secs, c.duration_secs))
            .chain(
                track
                    .midi_clips
                    .iter()
                    .map(|c| (c.start_secs, c.duration_secs)),
            )
        {
            if !start.is_finite()
                || !duration.is_finite()
                || start < 0.0
                || duration <= 0.0
                || start + duration > 3600.0
            {
                return Err("Clips must have a positive duration and fit within one hour".into());
            }
            end = end.max(start + duration);
        }
        for clip in &track.clips {
            if !clip.source_offset_secs.is_finite() || clip.source_offset_secs < 0.0 {
                return Err("Invalid clip source offset".into());
            }
            if let Some(warp) = clip.warp.as_ref().filter(|w| w.enabled) {
                let source = warp.source_bpm.unwrap_or(project.bpm);
                let target = warp.target_bpm.unwrap_or(project.bpm);
                if !source.is_finite()
                    || !target.is_finite()
                    || source <= 0.0
                    || target <= 0.0
                    || !(0.25..=4.0).contains(&(source / target))
                {
                    return Err("Warp tempo ratio must be between 0.25 and 4".into());
                }
            }
        }
    }
    if end * project.sample_rate as f64 * 2.0 * project.tracks.len() as f64 > 256_000_000.0 {
        return Err(
            "Arrangement exceeds the render memory budget; reduce its length, rate or track count"
                .into(),
        );
    }
    if let Some(region) = &project.loop_region {
        if !region.start_secs.is_finite()
            || !region.end_secs.is_finite()
            || region.start_secs < 0.0
            || region.end_secs <= region.start_secs
        {
            return Err("Invalid loop region".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn old_schema_migrates_and_keeps_identity_after_save() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("old.deck");
        let mut value = serde_json::to_value(Project::default()).unwrap();
        value["version"] = serde_json::json!(8);
        value.as_object_mut().unwrap().remove("id");
        fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();
        let p = load_project(&path).unwrap();
        assert_eq!(p.version, 9);
        save_project(&p, &path).unwrap();
        let again = load_project(&path).unwrap();
        assert_eq!(p.id, again.id);
        assert!(path.with_extension("deck.bak").exists());
    }
    #[test]
    fn invalid_save_does_not_damage_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("good.deck");
        let mut p = Project::default();
        save_project(&p, &path).unwrap();
        let original = fs::read(&path).unwrap();
        p.bpm = f64::NAN;
        assert!(save_project(&p, &path).is_err());
        assert_eq!(original, fs::read(&path).unwrap());
    }
    #[test]
    fn future_version_does_not_wrap_around() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("future.deck");
        let mut value = serde_json::to_value(Project::default()).unwrap();
        value["version"] = serde_json::json!(4294967297u64);
        fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();
        assert!(load_project(&path).is_err());
    }
}
