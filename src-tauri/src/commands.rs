//! Tauri commands: project, media, transport, waveform, MIDI, loop, recording.

use crate::assistant;
use crate::audio::recording::RecordingHandle;
use crate::audio::{
    compute_waveform_peaks, render_playback_preview, render_project_for_realtime_playback,
    render_project_track, render_project_tracks, write_wav_mono, PlaybackHandle,
};
use crate::deck;
use crate::models::{
    AppMode, AssetClassification, AssistantPreset, BlackoutState, BrandingConfig, ChordSuggestion,
    CompRegion, CompatibilityReport, Crate, CrossfaderSide, CrossfaderState, CuePoint, CueSequence,
    CueTrigger, DashboardWidgetState, DeckEventBinding, DeckSceneLink, DeckState, DeckSyncState,
    DeckTrackReference, DeviceBinding, DeviceDiagnosticState, DeviceProfile, DmxBridgeConfig,
    ErrorReport, FallbackProfile, FreezeState, HarmonySuggestionPack, InstrumentAssignment,
    LibraryItem, LightingCue, LightingCueBinding, LoopRegion, LoopState, MediaAsset, MidiClip,
    MigrationPlan, MigrationStep, MonitoringState, NavigationState, OnboardingState, PanicAction,
    PerformanceDashboardState, PerformanceMacro, PerformanceModeState, PerformancePad,
    PerformanceProfile, PluginDescriptor, PluginInstance, PluginParameterState, ProducerInsight,
    ProgressionSuggestion, Project, RecoveryAction, RecoverySnapshot, ReleaseConfig,
    ReleaseReadinessCheck, RenderJob, SafetyState, SamplerSlot, SceneTrigger, Setlist,
    SetlistEntry, ShortcutBinding, ShowCue, ShowProject, ShowTrigger, SidechainRoute, SongCueMap,
    StatusIndicatorState, SupportBundle, SystemHealthSnapshot, TakeLane, TimelineClip, Track,
    TrackType, UserPreferences, VisualCue, VisualSyncState, TICKS_PER_BEAT,
};
use crate::plugin_host;
use crate::project_io;
use crate::recovery;
use crate::show_control;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

pub struct AppState {
    pub project: Mutex<Project>,
    pub project_path: Mutex<Option<PathBuf>>,
    pub playback: PlaybackHandle,
    pub recording: Mutex<Option<RecordingHandle>>,
}

fn now_unix_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn sanitize_filename(name: &str) -> String {
    let out: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    out.trim_matches('_').to_string()
}

/// Validate that a path is within allowed directories (no path traversal).
/// Canonicalizes the path and checks it falls under one of the allowed roots.
fn validate_path_safe(path: &std::path::Path) -> Result<std::path::PathBuf, String> {
    // Resolve to absolute path, following symlinks
    let canonical = if path.exists() {
        path.canonicalize()
            .map_err(|e| format!("Invalid path: {}", e))?
    } else {
        // For new files, canonicalize the parent and append the filename
        let parent = path.parent().ok_or("Invalid path: no parent directory")?;
        if !parent.exists() {
            // Allow create_dir_all but validate the intended root
            let mut root = parent.to_path_buf();
            while !root.exists() {
                root = root
                    .parent()
                    .ok_or("Invalid path: cannot resolve root")?
                    .to_path_buf();
            }
            let canonical_root = root
                .canonicalize()
                .map_err(|e| format!("Invalid path: {}", e))?;
            let remainder = parent.strip_prefix(&root).unwrap_or(parent);
            let full = canonical_root
                .join(remainder)
                .join(path.file_name().ok_or("Invalid path: no filename")?);
            full
        } else {
            let canonical_parent = parent
                .canonicalize()
                .map_err(|e| format!("Invalid path: {}", e))?;
            canonical_parent.join(path.file_name().ok_or("Invalid path: no filename")?)
        }
    };

    // Block paths that contain traversal patterns after canonicalization
    let path_str = canonical.to_string_lossy();
    if path_str.contains("..") {
        return Err("Path traversal not allowed".to_string());
    }

    // Block sensitive system directories
    let blocked_prefixes = [
        "/etc", "/usr", "/bin", "/sbin", "/boot", "/proc", "/sys", "/dev", "/var/run",
    ];
    for prefix in &blocked_prefixes {
        if path_str.starts_with(prefix) {
            return Err(format!("Access to {} is not allowed", prefix));
        }
    }

    Ok(canonical)
}

fn find_deck_mut<'a>(project: &'a mut Project, deck_id: &str) -> Result<&'a mut DeckState, String> {
    project
        .decks
        .iter_mut()
        .find(|deck_state| deck_state.id.eq_ignore_ascii_case(deck_id))
        .ok_or_else(|| format!("Deck not found: {deck_id}"))
}

fn find_deck<'a>(project: &'a Project, deck_id: &str) -> Result<&'a DeckState, String> {
    project
        .decks
        .iter()
        .find(|deck_state| deck_state.id.eq_ignore_ascii_case(deck_id))
        .ok_or_else(|| format!("Deck not found: {deck_id}"))
}

fn execute_show_trigger(project: &mut Project, trigger_id: &str) -> Result<String, String> {
    let now = now_unix_ms();
    let trigger = project
        .show_triggers
        .iter()
        .find(|entry| entry.id == trigger_id)
        .ok_or("Show trigger not found")?;
    if !trigger.enabled {
        return Err("Show trigger is disabled".to_string());
    }
    let payload = show_control::execute_show_trigger(trigger)?;
    show_control::visual_sync_tick(&mut project.visual_sync, now);
    show_control::push_dashboard_event(
        &mut project.show_project.dashboard,
        "show_trigger",
        trigger.name.as_str(),
        payload.as_str(),
        now,
    );
    refresh_show_dashboard(project, now);
    Ok(payload)
}

fn normalize_deck_id(deck_id: &str) -> String {
    if deck_id.eq_ignore_ascii_case("b") {
        "B".to_string()
    } else {
        "A".to_string()
    }
}

fn migration_backup_path_for(project_path: Option<&PathBuf>, plan_id: &str) -> PathBuf {
    if let Some(path) = project_path {
        let mut backup = path.clone();
        if let Some(stem) = path.file_stem().and_then(|value| value.to_str()) {
            let ext = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("json");
            let short_id = plan_id.chars().take(8).collect::<String>();
            backup.set_file_name(format!("{stem}.migration-backup-{short_id}.{ext}"));
            return backup;
        }
    }
    PathBuf::from(format!("/tmp/devolution_migration_backup_{plan_id}.json"))
}

fn dispatch_error_report_to_endpoint(
    endpoint: &str,
    report: &ErrorReport,
    project: &Project,
) -> Result<(), String> {
    let payload = serde_json::json!({
        "report": report,
        "project": {
            "title": project.title,
            "version": project.version,
            "schema_version": crate::models::PROJECT_SCHEMA_VERSION,
        },
    });
    let body = serde_json::to_string(&payload).map_err(|e| format!("Serialize failed: {e}"))?;
    let response = ureq::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .post(endpoint)
        .set("content-type", "application/json")
        .send_string(body.as_str());
    match response {
        Ok(_) => Ok(()),
        Err(ureq::Error::Status(code, _)) => Err(format!("Endpoint returned HTTP {code}")),
        Err(ureq::Error::Transport(e)) => Err(format!("Transport failed: {e}")),
    }
}

fn evaluate_release_readiness(project: &Project, now_unix_ms: i64) -> ReleaseReadinessCheck {
    let mut blockers = Vec::new();
    let mut warnings = Vec::new();

    if !project.release_config.code_signing_ready {
        blockers.push("Code signing is not marked ready.".to_string());
    }
    if project.release_config.target_platforms.is_empty() {
        blockers.push("No target platforms configured.".to_string());
    }
    if project.release_config.crash_reporting_enabled
        && project
            .release_config
            .crash_report_endpoint
            .as_ref()
            .is_none_or(|value| value.trim().is_empty())
    {
        blockers.push("Crash reporting enabled but endpoint is not configured.".to_string());
    }
    if project
        .error_reports
        .iter()
        .any(|report| !report.acknowledged && report.severity.eq_ignore_ascii_case("error"))
    {
        blockers.push("Unacknowledged error-level reports are still present.".to_string());
    }
    if project.show_project.safety_state.panic_active {
        blockers.push("Show safety panic state is active.".to_string());
    }

    if let Some(last_report) = project.compatibility_reports.last() {
        if !last_report.compatible {
            blockers.push(
                "Latest compatibility report indicates unresolved migration issues.".to_string(),
            );
        }
    } else {
        warnings.push("No compatibility report has been generated in this session.".to_string());
    }

    if !project.device_diagnostics.healthy {
        warnings.push("Device diagnostics currently report unhealthy status.".to_string());
    }
    if project.monitoring.target_buffer_ms > 256 {
        warnings.push("Monitoring buffer exceeds 256 ms (latency may be high).".to_string());
    }
    if project.preferences.reduce_motion {
        warnings.push(
            "Reduced motion mode is enabled; verify stage animation cues manually.".to_string(),
        );
    }

    ReleaseReadinessCheck {
        id: Uuid::new_v4().to_string(),
        created_unix_ms: now_unix_ms,
        ready: blockers.is_empty(),
        blockers,
        warnings,
    }
}

fn refresh_show_dashboard(project: &mut Project, now_unix_ms: i64) {
    let dashboard = &mut project.show_project.dashboard;
    dashboard.active_sequence_id = project.show_project.active_sequence_id.clone();
    dashboard.active_scene_id = project.session.active_scene_id.clone();
    dashboard.deck_a_item_id =
        project
            .decks
            .iter()
            .find(|entry| entry.id == "A")
            .and_then(|deck_state| {
                deck_state
                    .loaded_track
                    .as_ref()
                    .map(|track| track.library_item_id.clone())
            });
    dashboard.deck_b_item_id =
        project
            .decks
            .iter()
            .find(|entry| entry.id == "B")
            .and_then(|deck_state| {
                deck_state
                    .loaded_track
                    .as_ref()
                    .map(|track| track.library_item_id.clone())
            });
    dashboard.status_banner = if project.show_project.safety_state.panic_active {
        Some("PANIC ACTIVE".to_string())
    } else if project.show_project.safety_state.blackout.enabled {
        Some("BLACKOUT ACTIVE".to_string())
    } else {
        None
    };
    dashboard.last_sync_unix_ms = Some(now_unix_ms);
}

fn note_show_error(project: &mut Project, source: &str, error: &str, now_unix_ms: i64) {
    project.show_project.safety_state.fail_count = project
        .show_project
        .safety_state
        .fail_count
        .saturating_add(1);
    project.show_project.safety_state.last_error = Some(error.to_string());
    show_control::push_dashboard_event(
        &mut project.show_project.dashboard,
        source,
        "error",
        error,
        now_unix_ms,
    );
    refresh_show_dashboard(project, now_unix_ms);
}

fn app_mode_default_main_view(mode: &AppMode) -> &'static str {
    match mode {
        AppMode::Studio => "arrangement",
        AppMode::Deck => "decks",
        AppMode::Show => "performance",
        AppMode::Hybrid => "session",
    }
}

fn default_recovery_actions(source: &str) -> Vec<RecoveryAction> {
    vec![
        RecoveryAction {
            id: format!("ack-{source}"),
            name: "Acknowledge".to_string(),
            description: "Mark this error as reviewed.".to_string(),
            command_id: "error_report_ack".to_string(),
            recommended: true,
        },
        RecoveryAction {
            id: format!("snapshot-{source}"),
            name: "Save Snapshot".to_string(),
            description: "Capture a recovery snapshot before further edits.".to_string(),
            command_id: "recovery_snapshot_save".to_string(),
            recommended: true,
        },
        RecoveryAction {
            id: format!("reset-safety-{source}"),
            name: "Reset Safety".to_string(),
            description: "Clear panic/blackout and return to stable runtime state.".to_string(),
            command_id: "safety_reset".to_string(),
            recommended: false,
        },
    ]
}

fn build_device_profiles(project: &Project, now_unix_ms: i64) -> Vec<DeviceProfile> {
    let mut out = vec![];
    if let Ok(inputs) = crate::audio::recording::list_input_devices() {
        for (idx, name) in inputs.iter().enumerate() {
            out.push(DeviceProfile {
                id: format!("audio-input-{idx}"),
                name: name.clone(),
                device_type: "audio_input".to_string(),
                connected: true,
                latency_ms: Some(project.monitoring.target_buffer_ms as f64),
                sample_rate: Some(project.sample_rate),
                channels: None,
                last_seen_unix_ms: Some(now_unix_ms),
                details: None,
            });
        }
    }

    for (idx, binding) in project.show_project.device_bindings.iter().enumerate() {
        if let Some(midi) = binding.midi_binding.as_ref() {
            out.push(DeviceProfile {
                id: format!("midi-binding-{idx}"),
                name: binding.name.clone(),
                device_type: "midi".to_string(),
                connected: binding.enabled,
                latency_ms: None,
                sample_rate: None,
                channels: Some(1),
                last_seen_unix_ms: Some(now_unix_ms),
                details: midi.device_name.clone(),
            });
        }
        if let Some(osc) = binding.osc_binding.as_ref() {
            out.push(DeviceProfile {
                id: format!("osc-binding-{idx}"),
                name: binding.name.clone(),
                device_type: "osc".to_string(),
                connected: binding.enabled,
                latency_ms: None,
                sample_rate: None,
                channels: None,
                last_seen_unix_ms: Some(now_unix_ms),
                details: Some(format!("{}:{}{}", osc.host, osc.port, osc.address)),
            });
        }
        if let Some(dmx) = binding.dmx_binding.as_ref() {
            out.push(DeviceProfile {
                id: format!("dmx-binding-{idx}"),
                name: binding.name.clone(),
                device_type: "dmx".to_string(),
                connected: binding.enabled,
                latency_ms: None,
                sample_rate: None,
                channels: Some(1),
                last_seen_unix_ms: Some(now_unix_ms),
                details: Some(format!("u{} ch{}", dmx.universe, dmx.channel)),
            });
        }
    }

    out
}

fn build_status_indicators(project: &Project, now_unix_ms: i64) -> Vec<StatusIndicatorState> {
    let audio_ready = project.monitoring.target_buffer_ms <= 256;
    let show_ready = !project.show_project.safety_state.panic_active;
    let pending_errors = project
        .error_reports
        .iter()
        .filter(|report| !report.acknowledged)
        .count() as u32;
    let diagnostics_healthy = project.device_diagnostics.healthy;

    vec![
        StatusIndicatorState {
            id: "audio".to_string(),
            label: "Audio Engine".to_string(),
            level: if audio_ready {
                "ok".to_string()
            } else {
                "warn".to_string()
            },
            detail: format!(
                "Buffer {} ms, direct monitor {}",
                project.monitoring.target_buffer_ms,
                if project.monitoring.direct_monitoring_preferred {
                    "preferred"
                } else {
                    "off"
                }
            ),
            updated_unix_ms: Some(now_unix_ms),
        },
        StatusIndicatorState {
            id: "devices".to_string(),
            label: "Device Diagnostics".to_string(),
            level: if diagnostics_healthy {
                "ok".to_string()
            } else {
                "warn".to_string()
            },
            detail: format!(
                "{} profiles, {} warnings, {} errors",
                project.device_profiles.len(),
                project.device_diagnostics.warnings.len(),
                project.device_diagnostics.errors.len()
            ),
            updated_unix_ms: Some(now_unix_ms),
        },
        StatusIndicatorState {
            id: "show".to_string(),
            label: "Show Engine".to_string(),
            level: if show_ready {
                "ok".to_string()
            } else {
                "error".to_string()
            },
            detail: if show_ready {
                format!(
                    "{} cues, {} sequences",
                    project.show_project.lighting_cues.len(),
                    project.show_project.cue_sequences.len()
                )
            } else {
                "Panic is active".to_string()
            },
            updated_unix_ms: Some(now_unix_ms),
        },
        StatusIndicatorState {
            id: "errors".to_string(),
            label: "Recovery Queue".to_string(),
            level: if pending_errors == 0 {
                "ok".to_string()
            } else {
                "warn".to_string()
            },
            detail: format!("{pending_errors} pending errors"),
            updated_unix_ms: Some(now_unix_ms),
        },
    ]
}

fn refresh_system_health(project: &mut Project, now_unix_ms: i64) {
    let status_indicators = build_status_indicators(project, now_unix_ms);
    let warning_count = status_indicators
        .iter()
        .filter(|indicator| indicator.level.eq_ignore_ascii_case("warn"))
        .count() as u32;
    let pending_errors = project
        .error_reports
        .iter()
        .filter(|report| !report.acknowledged)
        .count() as u32;
    let ok_count = status_indicators
        .iter()
        .filter(|indicator| indicator.level.eq_ignore_ascii_case("ok"))
        .count() as f64;
    let device_health_score = if status_indicators.is_empty() {
        1.0
    } else {
        (ok_count / status_indicators.len() as f64).clamp(0.0, 1.0)
    };

    project.system_health = SystemHealthSnapshot {
        captured_unix_ms: Some(now_unix_ms),
        transport_ready: true,
        audio_ready: project.monitoring.target_buffer_ms <= 256,
        show_ready: !project.show_project.safety_state.panic_active,
        device_health_score,
        pending_errors,
        recent_warning_count: warning_count,
        status_indicators: status_indicators.clone(),
    };
}

fn generate_compatibility_report(project: &Project, now_unix_ms: i64) -> CompatibilityReport {
    let mut warnings = vec![];
    let mut required_migrations = vec![];

    if project.version < crate::models::PROJECT_SCHEMA_VERSION {
        required_migrations.push(format!(
            "schema {} -> {}",
            project.version,
            crate::models::PROJECT_SCHEMA_VERSION
        ));
    }
    if project.monitoring.target_buffer_ms > 512 {
        warnings.push("High monitoring buffer may increase cue latency.".to_string());
    }
    if project.show_project.safety_state.fail_count > 0 {
        warnings.push(format!(
            "Show engine has {} recorded fail-safe events.",
            project.show_project.safety_state.fail_count
        ));
    }

    let missing_assets = project
        .media
        .iter()
        .filter(|asset| !std::path::Path::new(asset.path.as_str()).exists())
        .map(|asset| asset.path.clone())
        .collect::<Vec<_>>();
    if !missing_assets.is_empty() {
        warnings.push("Some media assets are missing on disk.".to_string());
    }

    CompatibilityReport {
        id: Uuid::new_v4().to_string(),
        created_unix_ms: now_unix_ms,
        schema_version: project.version,
        compatible: required_migrations.is_empty() && missing_assets.is_empty(),
        warnings,
        required_migrations,
        missing_assets,
    }
}

fn build_migration_plan(project: &Project, now_unix_ms: i64, target_version: u32) -> MigrationPlan {
    let mut steps = vec![];
    let source_version = project.version;
    if source_version < target_version {
        for version in source_version..target_version {
            steps.push(MigrationStep {
                id: format!("migrate-{}-{}", version, version + 1),
                description: format!("Upgrade schema from v{} to v{}", version, version + 1),
                applied: false,
                error: None,
            });
        }
    } else {
        steps.push(MigrationStep {
            id: "noop".to_string(),
            description: "Project already at target schema".to_string(),
            applied: true,
            error: None,
        });
    }

    MigrationPlan {
        id: Uuid::new_v4().to_string(),
        created_unix_ms: now_unix_ms,
        source_version,
        target_version,
        backup_path: None,
        steps,
        applied: source_version >= target_version,
    }
}

fn build_media_index(search_roots: &[PathBuf], max_files: usize) -> HashMap<String, Vec<PathBuf>> {
    let mut index: HashMap<String, Vec<PathBuf>> = HashMap::new();
    let mut file_count = 0usize;
    for root in search_roots {
        if !root.exists() || !root.is_dir() {
            continue;
        }
        for entry in walkdir::WalkDir::new(root).follow_links(true) {
            let Ok(entry) = entry else { continue };
            if !entry.file_type().is_file() {
                continue;
            }
            file_count += 1;
            if file_count > max_files {
                return index;
            }
            let filename = entry.file_name().to_string_lossy().to_string();
            if filename.is_empty() {
                continue;
            }
            let key = filename.to_ascii_lowercase();
            index
                .entry(key)
                .or_default()
                .push(entry.path().to_path_buf());
        }
    }
    index
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WaveformPeaksPayload {
    pub sample_rate: u32,
    pub duration_secs: f64,
    pub buckets: Vec<WaveformBucketPayload>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WaveformBucketPayload {
    pub min: f32,
    pub max: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MissingMediaAsset {
    pub asset_id: String,
    pub name: String,
    pub path: String,
    pub filename: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaRelinkResult {
    pub asset_id: String,
    pub old_path: String,
    pub new_path: Option<String>,
    pub candidate_count: u32,
    pub relinked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginChainIssue {
    pub track_id: String,
    pub track_name: String,
    pub instance_id: String,
    pub descriptor_id: String,
    pub severity: String,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct PlaceClipPayload {
    pub media_asset_id: String,
    pub track_index: u32,
    pub start_secs: f64,
    pub source_offset_secs: f64,
    pub duration_secs: f64,
}

#[derive(Debug, Deserialize)]
pub struct PlayClipPayload {
    pub path: String,
    pub offset_secs: f64,
    pub duration_secs: f64,
}

/// Create new project (in-memory).
#[tauri::command]
pub fn project_new(state: State<AppState>) -> Result<Project, String> {
    let mut project = Project::default();
    project.plugin_registry = plugin_host::builtin_descriptors();
    let now = now_unix_ms();
    project.navigation.main_view =
        app_mode_default_main_view(&project.navigation.active_mode).to_string();
    project.device_profiles = build_device_profiles(&project, now);
    project.device_diagnostics = DeviceDiagnosticState {
        last_run_unix_ms: Some(now),
        audio_input_devices: project
            .device_profiles
            .iter()
            .filter(|profile| profile.device_type == "audio_input")
            .map(|profile| profile.name.clone())
            .collect(),
        warnings: vec![],
        errors: vec![],
        midi_binding_count: 0,
        osc_binding_count: 0,
        dmx_universe_count: project.show_project.dmx_universes.len() as u32,
        healthy: true,
    };
    refresh_system_health(&mut project, now);
    let out = project.clone();
    *state.project.lock().map_err(|_| "lock")? = project;
    *state.project_path.lock().map_err(|_| "lock")? = None;
    Ok(out)
}

/// Save project to path.
#[tauri::command]
pub fn project_save(state: State<AppState>, path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    let project = state.project.lock().map_err(|_| "lock")?;
    project_io::save_project(&project, &path_buf)?;
    drop(project);
    *state.project_path.lock().map_err(|_| "lock")? = Some(path_buf);
    Ok(())
}

/// Open project from path.
#[tauri::command]
pub fn project_open(state: State<AppState>, path: String) -> Result<Project, String> {
    let path_buf = PathBuf::from(&path);
    let mut project = project_io::load_project(&path_buf)?;
    if project.plugin_registry.is_empty() {
        project.plugin_registry = plugin_host::builtin_descriptors();
    }
    let now = now_unix_ms();
    if project.navigation.main_view.trim().is_empty() {
        project.navigation.main_view =
            app_mode_default_main_view(&project.navigation.active_mode).to_string();
    }
    project.device_profiles = build_device_profiles(&project, now);
    refresh_system_health(&mut project, now);
    let out = project.clone();
    *state.project.lock().map_err(|_| "lock")? = project;
    *state.project_path.lock().map_err(|_| "lock")? = Some(path_buf);
    Ok(out)
}

/// Get current project.
#[tauri::command]
pub fn project_get(state: State<AppState>) -> Result<Project, String> {
    let project = state.project.lock().map_err(|_| "lock")?;
    Ok(project.clone())
}

/// Update project (e.g. title, bpm). Full replace for Phase 1.
#[tauri::command]
pub fn project_update(state: State<AppState>, mut project: Project) -> Result<Project, String> {
    project.version = crate::models::PROJECT_SCHEMA_VERSION;
    if project.plugin_registry.is_empty() {
        project.plugin_registry = plugin_host::builtin_descriptors();
    }
    let now = now_unix_ms();
    if project.navigation.main_view.trim().is_empty() {
        project.navigation.main_view =
            app_mode_default_main_view(&project.navigation.active_mode).to_string();
    }
    project.device_profiles = build_device_profiles(&project, now);
    refresh_system_health(&mut project, now);
    let out = project.clone();
    *state.project.lock().map_err(|_| "lock")? = project;
    Ok(out)
}

/// Import audio file: read metadata, add to project media, return asset.
#[tauri::command]
pub fn media_import_audio(state: State<AppState>, path: String) -> Result<MediaAsset, String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.exists() {
        return Err("File not found".to_string());
    }
    let path_buf = validate_path_safe(&path_buf)?;
    let peaks = compute_waveform_peaks(&path_buf, 1)?;
    let name = path_buf
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("audio")
        .to_string();
    let asset = MediaAsset {
        id: Uuid::new_v4().to_string(),
        name: name.clone(),
        path: path_buf.to_string_lossy().to_string(),
        duration_secs: peaks.duration_secs,
        sample_rate: peaks.sample_rate,
        channels: peaks.channels,
    };
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.media.push(asset.clone());
    Ok(asset)
}

/// Get waveform peaks for a media file (by path). Used when drawing clip waveforms.
#[tauri::command]
pub fn waveform_peaks(path: String, num_buckets: usize) -> Result<WaveformPeaksPayload, String> {
    let path_buf = validate_path_safe(&PathBuf::from(&path))?;
    let peaks = compute_waveform_peaks(&path_buf, num_buckets.max(2).min(4096))?;
    Ok(WaveformPeaksPayload {
        sample_rate: peaks.sample_rate,
        duration_secs: peaks.duration_secs,
        buckets: peaks
            .buckets
            .into_iter()
            .map(|b| WaveformBucketPayload {
                min: b.min,
                max: b.max,
            })
            .collect(),
    })
}

/// Add a track. track_type: "audio" | "midi" (defaults to "audio").
#[tauri::command]
pub fn track_add(
    state: State<AppState>,
    name: String,
    track_type: Option<String>,
) -> Result<Track, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let index = project.tracks.len() as u32;
    let tt = match track_type.as_deref() {
        Some("midi") => TrackType::Midi,
        _ => TrackType::Audio,
    };
    let track = Track {
        id: Uuid::new_v4().to_string(),
        name: if name.is_empty() {
            format!(
                "{} {}",
                if tt == TrackType::Midi {
                    "MIDI"
                } else {
                    "Track"
                },
                index + 1
            )
        } else {
            name
        },
        index,
        track_type: tt,
        clips: vec![],
        midi_clips: vec![],
        instrument: None,
        volume_db: 0.0,
        pan: 0.0,
        muted: false,
        solo: false,
        group_track_id: None,
        plugin_chain: Default::default(),
        freeze_state: FreezeState::default(),
        take_lanes: vec![],
        comp_regions: vec![],
        armed: false,
    };
    project.tracks.push(track.clone());
    Ok(track)
}

/// Place a clip on a track.
#[tauri::command]
pub fn clip_place(
    state: State<AppState>,
    payload: PlaceClipPayload,
) -> Result<TimelineClip, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let track = project
        .tracks
        .get_mut(payload.track_index as usize)
        .ok_or("Track not found")?;
    if track.track_type != TrackType::Audio {
        return Err("Cannot place audio clip on non-audio track".to_string());
    }
    if payload.start_secs < 0.0 {
        return Err("start_secs cannot be negative".to_string());
    }
    if payload.duration_secs <= 0.0 {
        return Err("duration_secs must be positive".to_string());
    }
    let clip = TimelineClip {
        id: Uuid::new_v4().to_string(),
        media_asset_id: payload.media_asset_id,
        start_secs: payload.start_secs,
        source_offset_secs: payload.source_offset_secs,
        duration_secs: payload.duration_secs,
        warp: None,
        slice_markers: vec![],
    };
    track.clips.push(clip.clone());
    Ok(clip)
}

/// Play audio (path, offset, duration). Used for transport play with first clip.
#[tauri::command]
pub fn playback_play(state: State<AppState>, payload: PlayClipPayload) -> Result<(), String> {
    let path = PathBuf::from(&payload.path);
    let path = validate_path_safe(&path)?;
    let maybe_preview = {
        let project = state.project.lock().map_err(|_| "lock")?;
        render_playback_preview(
            &project,
            path.as_path(),
            payload.offset_secs,
            payload.duration_secs,
        )
        .ok()
    };

    if let Some((sample_rate, samples)) = maybe_preview {
        if !samples.is_empty() {
            return state
                .playback
                .play_samples(samples, sample_rate, 1, payload.offset_secs);
        }
    }

    state
        .playback
        .play(&path, payload.offset_secs, payload.duration_secs)
}

/// Play the full arrangement from a timeline position.
#[tauri::command]
pub fn playback_play_arrangement(
    state: State<AppState>,
    start_secs: Option<f64>,
) -> Result<(), String> {
    let start_secs = start_secs.unwrap_or(0.0).max(0.0);
    let playback_buffer = {
        let project = state.project.lock().map_err(|_| "lock")?;
        render_project_for_realtime_playback(&project, start_secs)?
    };
    state.playback.play_samples(
        playback_buffer.samples,
        playback_buffer.sample_rate,
        playback_buffer.channels,
        playback_buffer.timeline_start_secs,
    )
}

/// Stop playback.
#[tauri::command]
pub fn playback_stop(state: State<AppState>) -> Result<(), String> {
    state.playback.stop();
    Ok(())
}

/// Get current position in ms.
#[tauri::command]
pub fn playback_position_ms(state: State<AppState>) -> Result<u64, String> {
    Ok(state.playback.position_ms())
}

/// Check if playing.
#[tauri::command]
pub fn playback_is_playing(state: State<AppState>) -> Result<bool, String> {
    Ok(state.playback.is_playing())
}

/// Seek playback to a position (seconds). Updates atomic position; does not restart audio.
#[tauri::command]
pub fn playback_seek(state: State<AppState>, position_secs: f64) -> Result<(), String> {
    let ms = (position_secs * 1000.0) as u64;
    state.playback.seek_ms(ms);
    Ok(())
}

// ---------------------------------------------------------------------------
// MIDI clip commands
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct AddMidiClipPayload {
    pub track_id: String,
    pub start_secs: f64,
    pub duration_secs: f64,
}

/// Add an empty MIDI clip to a track.
#[tauri::command]
pub fn midi_clip_add(
    state: State<AppState>,
    payload: AddMidiClipPayload,
) -> Result<MidiClip, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let track = project
        .tracks
        .iter_mut()
        .find(|t| t.id == payload.track_id)
        .ok_or("Track not found")?;
    if track.track_type != TrackType::Midi {
        return Err("Cannot add MIDI clip to non-MIDI track".to_string());
    }
    let clip = MidiClip {
        id: Uuid::new_v4().to_string(),
        start_secs: payload.start_secs,
        duration_secs: payload.duration_secs,
        notes: vec![],
        loop_clip: false,
    };
    track.midi_clips.push(clip.clone());
    Ok(clip)
}

/// Replace a MIDI clip with an updated version (notes, duration, etc.).
#[tauri::command]
pub fn midi_clip_update(
    state: State<AppState>,
    track_id: String,
    clip: MidiClip,
) -> Result<MidiClip, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let track = project
        .tracks
        .iter_mut()
        .find(|t| t.id == track_id)
        .ok_or("Track not found")?;
    if track.track_type != TrackType::Midi {
        return Err("Cannot update MIDI clip on non-MIDI track".to_string());
    }
    let slot = track
        .midi_clips
        .iter_mut()
        .find(|c| c.id == clip.id)
        .ok_or("Clip not found")?;
    *slot = clip.clone();
    Ok(clip)
}

/// Delete a MIDI clip from a track.
#[tauri::command]
pub fn midi_clip_delete(
    state: State<AppState>,
    track_id: String,
    clip_id: String,
) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let track = project
        .tracks
        .iter_mut()
        .find(|t| t.id == track_id)
        .ok_or("Track not found")?;
    track.midi_clips.retain(|c| c.id != clip_id);
    Ok(())
}

/// Duplicate a MIDI clip, placing the copy immediately after the original.
#[tauri::command]
pub fn midi_clip_duplicate(
    state: State<AppState>,
    track_id: String,
    clip_id: String,
) -> Result<MidiClip, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let track = project
        .tracks
        .iter_mut()
        .find(|t| t.id == track_id)
        .ok_or("Track not found")?;
    let original = track
        .midi_clips
        .iter()
        .find(|c| c.id == clip_id)
        .ok_or("Clip not found")?
        .clone();
    let mut copy = original.clone();
    copy.id = Uuid::new_v4().to_string();
    copy.start_secs = original.start_secs + original.duration_secs;
    track.midi_clips.push(copy.clone());
    Ok(copy)
}

// ---------------------------------------------------------------------------
// Loop region commands
// ---------------------------------------------------------------------------

/// Set the loop region. Overwrites any existing region.
#[tauri::command]
pub fn loop_region_set(
    state: State<AppState>,
    start_secs: f64,
    end_secs: f64,
    enabled: bool,
) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.loop_region = Some(LoopRegion {
        start_secs,
        end_secs,
        enabled,
    });
    Ok(())
}

/// Clear the loop region.
#[tauri::command]
pub fn loop_region_clear(state: State<AppState>) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.loop_region = None;
    Ok(())
}

// ---------------------------------------------------------------------------
// Track type / instrument commands
// ---------------------------------------------------------------------------

/// Change a track's type (audio/midi).
#[tauri::command]
pub fn track_set_type(
    state: State<AppState>,
    track_id: String,
    track_type: String,
) -> Result<Track, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let track = project
        .tracks
        .iter_mut()
        .find(|t| t.id == track_id)
        .ok_or("Track not found")?;
    track.track_type = match track_type.as_str() {
        "midi" => TrackType::Midi,
        _ => TrackType::Audio,
    };
    Ok(track.clone())
}

/// Assign or update an instrument on a track.
#[tauri::command]
pub fn track_set_instrument(
    state: State<AppState>,
    track_id: String,
    instrument: InstrumentAssignment,
) -> Result<Track, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let track = project
        .tracks
        .iter_mut()
        .find(|t| t.id == track_id)
        .ok_or("Track not found")?;
    track.instrument = Some(instrument);
    Ok(track.clone())
}

// ---------------------------------------------------------------------------
// Recording commands
// ---------------------------------------------------------------------------

/// List available audio input device names.
#[tauri::command]
pub fn recording_list_devices() -> Result<Vec<String>, String> {
    crate::audio::recording::list_input_devices()
}

/// Start recording from a named input device to a file path.
#[tauri::command]
pub fn recording_start(
    state: State<AppState>,
    device_name: Option<String>,
    output_path: String,
    target_buffer_ms: Option<u32>,
) -> Result<(), String> {
    let output_path = validate_path_safe(&std::path::PathBuf::from(&output_path))?;
    let handle = crate::audio::recording::start_recording(
        device_name.as_deref(),
        &output_path,
        target_buffer_ms,
    )?;
    *state.recording.lock().map_err(|_| "lock")? = Some(handle);
    Ok(())
}

/// Stop recording. Returns the path to the completed WAV file.
#[tauri::command]
pub fn recording_stop(state: State<AppState>) -> Result<String, String> {
    let mut guard = state.recording.lock().map_err(|_| "lock")?;
    let handle = guard.take().ok_or("Not recording")?;
    let path = crate::audio::recording::stop_recording(handle)?;
    Ok(path.to_string_lossy().to_string())
}

/// Check if recording is active.
#[tauri::command]
pub fn recording_is_active(state: State<AppState>) -> Result<bool, String> {
    Ok(state.recording.lock().map_err(|_| "lock")?.is_some())
}

// ---------------------------------------------------------------------------
// Phase 4: Plugin hosting / chains
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn plugin_scan_default(state: State<AppState>) -> Result<Vec<PluginDescriptor>, String> {
    let roots = plugin_host::default_vst3_roots();
    let descriptors = plugin_host::scan_vst3_roots(&roots);
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.plugin_registry = descriptors.clone();
    Ok(descriptors)
}

#[tauri::command]
pub fn plugin_scan_paths(
    state: State<AppState>,
    roots: Vec<String>,
) -> Result<Vec<PluginDescriptor>, String> {
    let paths: Vec<PathBuf> = roots.iter().map(PathBuf::from).collect();
    let descriptors = plugin_host::scan_vst3_roots(&paths);
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.plugin_registry = descriptors.clone();
    Ok(descriptors)
}

#[tauri::command]
pub fn track_plugin_insert(
    state: State<AppState>,
    track_id: String,
    descriptor_id: String,
) -> Result<Track, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    if !project
        .plugin_registry
        .iter()
        .any(|descriptor| descriptor.id == descriptor_id)
    {
        return Err("Plugin descriptor not found".to_string());
    }
    let track = project
        .tracks
        .iter_mut()
        .find(|track| track.id == track_id)
        .ok_or("Track not found")?;
    let order = track.plugin_chain.instances.len() as u32;
    track.plugin_chain.instances.push(PluginInstance {
        id: Uuid::new_v4().to_string(),
        descriptor_id,
        enabled: true,
        bypassed: false,
        order,
        parameters: vec![],
        serialized_state_b64: None,
    });
    Ok(track.clone())
}

#[tauri::command]
pub fn track_plugin_remove(
    state: State<AppState>,
    track_id: String,
    instance_id: String,
) -> Result<Track, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let track = project
        .tracks
        .iter_mut()
        .find(|track| track.id == track_id)
        .ok_or("Track not found")?;
    track
        .plugin_chain
        .instances
        .retain(|instance| instance.id != instance_id);
    for (idx, instance) in track.plugin_chain.instances.iter_mut().enumerate() {
        instance.order = idx as u32;
    }
    Ok(track.clone())
}

#[tauri::command]
pub fn track_plugin_move(
    state: State<AppState>,
    track_id: String,
    instance_id: String,
    to_index: u32,
) -> Result<Track, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let track = project
        .tracks
        .iter_mut()
        .find(|track| track.id == track_id)
        .ok_or("Track not found")?;
    let from_index = track
        .plugin_chain
        .instances
        .iter()
        .position(|instance| instance.id == instance_id)
        .ok_or("Plugin instance not found")?;
    let instance = track.plugin_chain.instances.remove(from_index);
    let insert_at = (to_index as usize).min(track.plugin_chain.instances.len());
    track.plugin_chain.instances.insert(insert_at, instance);
    for (idx, inst) in track.plugin_chain.instances.iter_mut().enumerate() {
        inst.order = idx as u32;
    }
    Ok(track.clone())
}

#[tauri::command]
pub fn track_plugin_set_bypass(
    state: State<AppState>,
    track_id: String,
    instance_id: String,
    bypassed: bool,
) -> Result<Track, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let track = project
        .tracks
        .iter_mut()
        .find(|track| track.id == track_id)
        .ok_or("Track not found")?;
    let instance = track
        .plugin_chain
        .instances
        .iter_mut()
        .find(|instance| instance.id == instance_id)
        .ok_or("Plugin instance not found")?;
    instance.bypassed = bypassed;
    Ok(track.clone())
}

#[tauri::command]
pub fn track_plugin_set_enabled(
    state: State<AppState>,
    track_id: String,
    instance_id: String,
    enabled: bool,
) -> Result<Track, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let track = project
        .tracks
        .iter_mut()
        .find(|track| track.id == track_id)
        .ok_or("Track not found")?;
    let instance = track
        .plugin_chain
        .instances
        .iter_mut()
        .find(|instance| instance.id == instance_id)
        .ok_or("Plugin instance not found")?;
    instance.enabled = enabled;
    Ok(track.clone())
}

#[tauri::command]
pub fn track_plugin_set_parameter(
    state: State<AppState>,
    track_id: String,
    instance_id: String,
    parameter_id: String,
    value: f64,
) -> Result<Track, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let track = project
        .tracks
        .iter_mut()
        .find(|track| track.id == track_id)
        .ok_or("Track not found")?;
    let instance = track
        .plugin_chain
        .instances
        .iter_mut()
        .find(|instance| instance.id == instance_id)
        .ok_or("Plugin instance not found")?;
    if let Some(param) = instance
        .parameters
        .iter_mut()
        .find(|param| param.id == parameter_id)
    {
        param.value = value;
    } else {
        instance.parameters.push(PluginParameterState {
            id: parameter_id,
            value,
        });
    }
    Ok(track.clone())
}

// ---------------------------------------------------------------------------
// Phase 4: Sidechain routing
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn sidechain_route_add(
    state: State<AppState>,
    from_track_id: String,
    to_track_id: String,
    target_plugin_instance_id: Option<String>,
    amount: f64,
) -> Result<SidechainRoute, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    if !project.tracks.iter().any(|track| track.id == from_track_id) {
        return Err("Source track not found".to_string());
    }
    if !project.tracks.iter().any(|track| track.id == to_track_id) {
        return Err("Target track not found".to_string());
    }
    let route = SidechainRoute {
        id: Uuid::new_v4().to_string(),
        from_track_id,
        to_track_id,
        target_plugin_instance_id,
        amount: amount.clamp(0.0, 1.0),
        enabled: true,
    };
    project.sidechain_routes.push(route.clone());
    Ok(route)
}

#[tauri::command]
pub fn sidechain_route_update(
    state: State<AppState>,
    route_id: String,
    amount: f64,
    enabled: bool,
) -> Result<SidechainRoute, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let route = project
        .sidechain_routes
        .iter_mut()
        .find(|route| route.id == route_id)
        .ok_or("Sidechain route not found")?;
    route.amount = amount.clamp(0.0, 1.0);
    route.enabled = enabled;
    Ok(route.clone())
}

#[tauri::command]
pub fn sidechain_route_remove(state: State<AppState>, route_id: String) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project
        .sidechain_routes
        .retain(|route| route.id != route_id);
    Ok(())
}

// ---------------------------------------------------------------------------
// Phase 4: Freeze/render/stems
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct StemExportConfig {
    pub output_dir: String,
    pub include_muted: bool,
    pub skip_silent_tracks: bool,
    pub filename_prefix: Option<String>,
}

#[tauri::command]
pub fn stem_export_start(
    state: State<AppState>,
    config: StemExportConfig,
) -> Result<RenderJob, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let rendered = render_project_tracks(&project, config.include_muted)?;
    let output_dir = PathBuf::from(&config.output_dir);
    let output_dir = validate_path_safe(&output_dir)?;
    std::fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;

    let mut output_files = Vec::new();
    for rendered_track in rendered {
        if config.skip_silent_tracks
            && rendered_track
                .samples
                .iter()
                .all(|sample| sample.abs() < 0.0001)
        {
            continue;
        }
        let track_index = project
            .tracks
            .iter()
            .find(|track| track.id == rendered_track.track_id)
            .map(|track| track.index)
            .unwrap_or(0);
        let prefix = config
            .filename_prefix
            .as_ref()
            .map(|value| sanitize_filename(value))
            .filter(|value| !value.is_empty())
            .map(|value| format!("{value}_"))
            .unwrap_or_default();
        let file_name = format!(
            "{}{:02}_{}.wav",
            prefix,
            track_index + 1,
            sanitize_filename(&rendered_track.name)
        );
        let output_path = output_dir.join(file_name);
        write_wav_mono(
            &output_path,
            rendered_track.sample_rate,
            &rendered_track.samples,
        )?;
        output_files.push(output_path.to_string_lossy().to_string());
    }

    let now = now_unix_ms();
    let job = RenderJob {
        id: Uuid::new_v4().to_string(),
        kind: "stem_export".to_string(),
        status: "completed".to_string(),
        output_dir: output_dir.to_string_lossy().to_string(),
        output_files,
        created_unix_ms: now,
        completed_unix_ms: Some(now),
    };
    project.render_jobs.push(job.clone());
    if project.render_jobs.len() > 400 {
        let trim = project.render_jobs.len() - 400;
        project.render_jobs.drain(0..trim);
    }
    Ok(job)
}

#[tauri::command]
pub fn track_freeze(
    state: State<AppState>,
    track_id: String,
    output_dir: String,
) -> Result<Track, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let rendered = render_project_track(&project, track_id.as_str())?;
    let output_dir = PathBuf::from(output_dir);
    let output_dir = validate_path_safe(&output_dir)?;
    std::fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;
    let output_path = output_dir.join(format!("freeze_{}.wav", sanitize_filename(&track_id)));
    write_wav_mono(&output_path, rendered.sample_rate, &rendered.samples)?;

    let freeze_asset = MediaAsset {
        id: Uuid::new_v4().to_string(),
        name: format!("Freeze {}", rendered.name),
        path: output_path.to_string_lossy().to_string(),
        duration_secs: rendered.samples.len() as f64 / rendered.sample_rate as f64,
        sample_rate: rendered.sample_rate,
        channels: 1,
    };
    project.media.push(freeze_asset.clone());

    let track = project
        .tracks
        .iter_mut()
        .find(|track| track.id == track_id)
        .ok_or("Track not found")?;
    track.freeze_state = FreezeState {
        is_frozen: true,
        frozen_asset_id: Some(freeze_asset.id.clone()),
        frozen_path: Some(freeze_asset.path.clone()),
        original_clips: track.clips.clone(),
        original_midi_clips: track.midi_clips.clone(),
    };
    track.clips = vec![TimelineClip {
        id: Uuid::new_v4().to_string(),
        media_asset_id: freeze_asset.id.clone(),
        start_secs: 0.0,
        source_offset_secs: 0.0,
        duration_secs: freeze_asset.duration_secs,
        warp: None,
        slice_markers: vec![],
    }];
    track.midi_clips.clear();
    Ok(track.clone())
}

#[tauri::command]
pub fn track_unfreeze(state: State<AppState>, track_id: String) -> Result<Track, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let track = project
        .tracks
        .iter_mut()
        .find(|track| track.id == track_id)
        .ok_or("Track not found")?;
    if !track.freeze_state.is_frozen {
        return Ok(track.clone());
    }
    track.clips = track.freeze_state.original_clips.clone();
    track.midi_clips = track.freeze_state.original_midi_clips.clone();
    track.freeze_state = FreezeState::default();
    Ok(track.clone())
}

#[tauri::command]
pub fn track_render_in_place(
    state: State<AppState>,
    track_id: String,
    start_secs: f64,
    end_secs: f64,
    output_dir: String,
) -> Result<Track, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let rendered = render_project_track(&project, track_id.as_str())?;
    let sample_rate = rendered.sample_rate;
    let start_idx = (start_secs.max(0.0) * sample_rate as f64).round() as usize;
    let end_idx = (end_secs.max(start_secs) * sample_rate as f64).round() as usize;
    let end_idx = end_idx.min(rendered.samples.len());
    if start_idx >= end_idx {
        return Err("Invalid render range".to_string());
    }
    let slice = &rendered.samples[start_idx..end_idx];
    let output_dir = PathBuf::from(output_dir);
    let output_dir = validate_path_safe(&output_dir)?;
    std::fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;
    let output_path = output_dir.join(format!(
        "render_{}_{}_{}.wav",
        sanitize_filename(&track_id),
        (start_secs * 100.0).round() as i64,
        (end_secs * 100.0).round() as i64
    ));
    write_wav_mono(&output_path, sample_rate, slice)?;

    let asset = MediaAsset {
        id: Uuid::new_v4().to_string(),
        name: format!("Render {}", rendered.name),
        path: output_path.to_string_lossy().to_string(),
        duration_secs: slice.len() as f64 / sample_rate as f64,
        sample_rate,
        channels: 1,
    };
    project.media.push(asset.clone());

    let track = project
        .tracks
        .iter_mut()
        .find(|track| track.id == track_id)
        .ok_or("Track not found")?;
    let clip = TimelineClip {
        id: Uuid::new_v4().to_string(),
        media_asset_id: asset.id.clone(),
        start_secs,
        source_offset_secs: 0.0,
        duration_secs: asset.duration_secs,
        warp: None,
        slice_markers: vec![],
    };
    track.clips.push(clip.clone());
    Ok(track.clone())
}

// ---------------------------------------------------------------------------
// Phase 4: Take lanes / comping
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn take_lane_add(
    state: State<AppState>,
    track_id: String,
    name: Option<String>,
) -> Result<Track, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let track = project
        .tracks
        .iter_mut()
        .find(|track| track.id == track_id)
        .ok_or("Track not found")?;
    let lane = TakeLane {
        id: Uuid::new_v4().to_string(),
        name: name.unwrap_or_else(|| format!("Take {}", track.take_lanes.len() + 1)),
        muted: false,
        clips: vec![],
    };
    track.take_lanes.push(lane);
    Ok(track.clone())
}

#[tauri::command]
pub fn take_lane_clip_add(
    state: State<AppState>,
    track_id: String,
    lane_id: String,
    media_asset_id: String,
    start_secs: f64,
    source_offset_secs: f64,
    duration_secs: f64,
) -> Result<Track, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let track = project
        .tracks
        .iter_mut()
        .find(|track| track.id == track_id)
        .ok_or("Track not found")?;
    let lane = track
        .take_lanes
        .iter_mut()
        .find(|lane| lane.id == lane_id)
        .ok_or("Take lane not found")?;
    lane.clips.push(crate::models::TakeClip {
        id: Uuid::new_v4().to_string(),
        media_asset_id,
        start_secs,
        source_offset_secs,
        duration_secs,
    });
    Ok(track.clone())
}

#[tauri::command]
pub fn comp_region_set(
    state: State<AppState>,
    track_id: String,
    lane_id: String,
    take_clip_id: String,
    start_secs: f64,
    end_secs: f64,
    fade_secs: f64,
) -> Result<Track, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let track = project
        .tracks
        .iter_mut()
        .find(|track| track.id == track_id)
        .ok_or("Track not found")?;
    track.comp_regions.push(CompRegion {
        id: Uuid::new_v4().to_string(),
        lane_id,
        take_clip_id,
        start_secs,
        end_secs,
        fade_secs: fade_secs.clamp(0.0, 2.0),
    });
    Ok(track.clone())
}

#[tauri::command]
pub fn comp_region_clear(
    state: State<AppState>,
    track_id: String,
    region_id: String,
) -> Result<Track, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let track = project
        .tracks
        .iter_mut()
        .find(|track| track.id == track_id)
        .ok_or("Track not found")?;
    track.comp_regions.retain(|region| region.id != region_id);
    Ok(track.clone())
}

// ---------------------------------------------------------------------------
// Phase 4: Recovery / autosave
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn recovery_snapshot_save(
    state: State<AppState>,
    reason: Option<String>,
) -> Result<RecoverySnapshot, String> {
    // Clone project data while holding the lock, then release before I/O
    let project_clone = {
        let project = state.project.lock().map_err(|_| "lock")?;
        project.clone()
    };
    // Perform filesystem I/O outside the mutex
    let snapshot = recovery::save_snapshot(&project_clone, reason.as_deref().unwrap_or("manual"))?;
    // Re-acquire lock to update snapshot list
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.recovery_snapshots.push(snapshot.clone());
    project
        .recovery_snapshots
        .sort_by(|a, b| b.created_unix_ms.cmp(&a.created_unix_ms));
    project.recovery_snapshots.truncate(50);
    Ok(snapshot)
}

#[tauri::command]
pub fn recovery_snapshot_list() -> Result<Vec<RecoverySnapshot>, String> {
    recovery::list_snapshots()
}

#[tauri::command]
pub fn recovery_snapshot_restore(
    state: State<AppState>,
    snapshot_path: String,
) -> Result<Project, String> {
    let path = PathBuf::from(snapshot_path);
    let restored = recovery::load_snapshot(&path)?;
    let mut project = restored.clone();
    project.version = crate::models::PROJECT_SCHEMA_VERSION;
    *state.project.lock().map_err(|_| "lock")? = project.clone();
    Ok(project)
}

// ---------------------------------------------------------------------------
// Phase 4: Monitoring / shortcuts
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn monitoring_update(
    state: State<AppState>,
    monitoring: MonitoringState,
) -> Result<MonitoringState, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.monitoring = monitoring.clone();
    Ok(monitoring)
}

#[tauri::command]
pub fn autosave_interval_set(state: State<AppState>, interval_secs: u32) -> Result<u32, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.autosave_interval_secs = interval_secs.clamp(10, 3600);
    Ok(project.autosave_interval_secs)
}

#[tauri::command]
pub fn shortcut_bindings_set(
    state: State<AppState>,
    bindings: Vec<ShortcutBinding>,
) -> Result<Vec<ShortcutBinding>, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.shortcuts = bindings.clone();
    Ok(bindings)
}

// ---------------------------------------------------------------------------
// Phase 5: AI assistant / dashboard / performance / branding
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn assistant_harmony_generate(
    key_root: String,
    scale: String,
    energy: f64,
    bars: u32,
) -> Result<HarmonySuggestionPack, String> {
    Ok(assistant::harmony_suggestions(
        &key_root, &scale, energy, bars,
    ))
}

#[tauri::command]
pub fn assistant_asset_classify(
    state: State<AppState>,
    apply_tags: bool,
) -> Result<Vec<AssetClassification>, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let classifications = assistant::classify_assets(&project);
    project.asset_classifications = classifications.clone();
    if apply_tags {
        assistant::apply_classification_tags(&mut project, &classifications);
    }
    Ok(classifications)
}

#[tauri::command]
pub fn assistant_vocal_presets(state: State<AppState>) -> Result<Vec<AssistantPreset>, String> {
    let project = state.project.lock().map_err(|_| "lock")?;
    Ok(assistant::vocal_assistant_presets(&project.plugin_registry))
}

#[tauri::command]
pub fn assistant_preset_apply(
    state: State<AppState>,
    track_id: String,
    preset_id: String,
) -> Result<Track, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let presets = assistant::vocal_assistant_presets(&project.plugin_registry);
    let preset = presets
        .iter()
        .find(|preset| preset.id == preset_id)
        .ok_or("Assistant preset not found")?;

    let mut next_instances = Vec::new();
    for (idx, step) in preset.steps.iter().enumerate() {
        let exists = project
            .plugin_registry
            .iter()
            .any(|descriptor| descriptor.id == step.descriptor_id);
        if !exists && step.optional {
            continue;
        }
        if !exists {
            return Err(format!(
                "Required plugin descriptor unavailable: {}",
                step.descriptor_id
            ));
        }
        next_instances.push(PluginInstance {
            id: Uuid::new_v4().to_string(),
            descriptor_id: step.descriptor_id.clone(),
            enabled: true,
            bypassed: false,
            order: idx as u32,
            parameters: step.parameters.clone(),
            serialized_state_b64: None,
        });
    }

    let track = project
        .tracks
        .iter_mut()
        .find(|track| track.id == track_id)
        .ok_or("Track not found")?;
    track.plugin_chain.instances = next_instances;
    Ok(track.clone())
}

#[tauri::command]
pub fn dashboard_insights_generate(state: State<AppState>) -> Result<Vec<ProducerInsight>, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let insights = assistant::producer_insights(&project);
    project.dashboard_widget_state.last_refresh_unix_ms = now_unix_ms();
    Ok(insights)
}

#[tauri::command]
pub fn dashboard_widget_state_update(
    state: State<AppState>,
    widget_state: DashboardWidgetState,
) -> Result<DashboardWidgetState, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.dashboard_widget_state = widget_state.clone();
    Ok(widget_state)
}

#[tauri::command]
pub fn performance_mode_update(
    state: State<AppState>,
    mut mode: PerformanceModeState,
) -> Result<PerformanceModeState, String> {
    mode.launch_quantize_beats = mode.launch_quantize_beats.clamp(1, 16);
    mode.crossfader = mode.crossfader.clamp(-1.0, 1.0);
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.performance_mode = mode.clone();
    Ok(mode)
}

#[tauri::command]
pub fn performance_macro_upsert(
    state: State<AppState>,
    mut macro_config: PerformanceMacro,
) -> Result<PerformanceMacro, String> {
    macro_config.color = if macro_config.color.trim().is_empty() {
        "#ff6b1a".to_string()
    } else {
        macro_config.color
    };
    for send in &mut macro_config.send_overrides {
        send.amount = send.amount.clamp(0.0, 1.0);
    }

    let mut project = state.project.lock().map_err(|_| "lock")?;
    if let Some(existing) = project
        .performance_macros
        .iter_mut()
        .find(|entry| entry.id == macro_config.id)
    {
        *existing = macro_config.clone();
    } else {
        project.performance_macros.push(macro_config.clone());
    }
    Ok(macro_config)
}

#[tauri::command]
pub fn performance_macro_remove(state: State<AppState>, macro_id: String) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project
        .performance_macros
        .retain(|entry| entry.id != macro_id);
    project
        .lighting_cue_bindings
        .retain(|binding| binding.macro_id != macro_id);
    if project.performance_mode.active_macro_id.as_deref() == Some(macro_id.as_str()) {
        project.performance_mode.active_macro_id = None;
    }
    Ok(())
}

#[tauri::command]
pub fn performance_macro_trigger(
    state: State<AppState>,
    macro_id: String,
) -> Result<PerformanceMacro, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let macro_config = project
        .performance_macros
        .iter()
        .find(|entry| entry.id == macro_id)
        .ok_or("Performance macro not found")?
        .clone();
    if !macro_config.enabled {
        return Err("Macro is disabled".to_string());
    }

    for mute in &macro_config.track_mutes {
        if let Some(track) = project
            .tracks
            .iter_mut()
            .find(|track| track.id == mute.track_id)
        {
            track.muted = mute.muted;
        }
    }
    for send_override in &macro_config.send_overrides {
        if let Some(send) = project
            .routing
            .sends
            .iter_mut()
            .find(|send| send.id == send_override.send_id)
        {
            send.amount = send_override.amount.clamp(0.0, 1.0);
            send.enabled = send_override.enabled;
        }
    }
    if let Some(scene_id) = &macro_config.launch_scene_id {
        project.session.active_scene_id = Some(scene_id.clone());
        project.performance_mode.selected_scene_id = Some(scene_id.clone());
    }
    project.performance_mode.active_macro_id = Some(macro_config.id.clone());

    let now = now_unix_ms();
    if !macro_config.trigger_cue_ids.is_empty() {
        show_control::visual_sync_tick(&mut project.visual_sync, now);
    }
    Ok(macro_config)
}

#[tauri::command]
pub fn scene_trigger_upsert(
    state: State<AppState>,
    mut trigger: SceneTrigger,
) -> Result<SceneTrigger, String> {
    trigger.launch_quantize_beats = trigger.launch_quantize_beats.clamp(1, 16);
    let mut project = state.project.lock().map_err(|_| "lock")?;
    if let Some(existing) = project
        .scene_triggers
        .iter_mut()
        .find(|entry| entry.id == trigger.id)
    {
        *existing = trigger.clone();
    } else {
        project.scene_triggers.push(trigger.clone());
    }
    Ok(trigger)
}

#[tauri::command]
pub fn scene_trigger_remove(state: State<AppState>, trigger_id: String) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project
        .scene_triggers
        .retain(|entry| entry.id != trigger_id);
    Ok(())
}

#[tauri::command]
pub fn show_cue_upsert(state: State<AppState>, cue: ShowCue) -> Result<ShowCue, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    if let Some(existing) = project
        .show_cues
        .iter_mut()
        .find(|entry| entry.id == cue.id)
    {
        *existing = cue.clone();
    } else {
        project.show_cues.push(cue.clone());
    }
    Ok(cue)
}

#[tauri::command]
pub fn show_cue_remove(state: State<AppState>, cue_id: String) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.show_cues.retain(|entry| entry.id != cue_id);
    project
        .lighting_cue_bindings
        .retain(|binding| binding.show_cue_id != cue_id);
    Ok(())
}

#[tauri::command]
pub fn show_cue_preview(state: State<AppState>, cue_id: String) -> Result<String, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let cue = project
        .show_cues
        .iter()
        .find(|entry| entry.id == cue_id)
        .ok_or("Cue not found")?;
    let payload = show_control::cue_preview_payload(cue);
    show_control::visual_sync_tick(&mut project.visual_sync, now_unix_ms());
    Ok(payload)
}

#[tauri::command]
pub fn lighting_cue_binding_upsert(
    state: State<AppState>,
    binding: LightingCueBinding,
) -> Result<LightingCueBinding, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    if let Some(existing) = project
        .lighting_cue_bindings
        .iter_mut()
        .find(|entry| entry.id == binding.id)
    {
        *existing = binding.clone();
    } else {
        project.lighting_cue_bindings.push(binding.clone());
    }
    Ok(binding)
}

#[tauri::command]
pub fn lighting_cue_binding_remove(
    state: State<AppState>,
    binding_id: String,
) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project
        .lighting_cue_bindings
        .retain(|entry| entry.id != binding_id);
    Ok(())
}

#[tauri::command]
pub fn visual_sync_update(
    state: State<AppState>,
    mut visual_sync: VisualSyncState,
) -> Result<VisualSyncState, String> {
    visual_sync.bpm_multiplier = visual_sync.bpm_multiplier.clamp(0.25, 4.0);
    visual_sync.fps_limit = visual_sync.fps_limit.clamp(24, 240);
    visual_sync.latency_ms = visual_sync.latency_ms.clamp(0.0, 500.0);
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.visual_sync = visual_sync.clone();
    Ok(visual_sync)
}

fn sanitize_hex(hex: &str, fallback: &str) -> String {
    let trimmed = hex.trim();
    if trimmed.len() == 7
        && trimmed.starts_with('#')
        && trimmed[1..].chars().all(|c| c.is_ascii_hexdigit())
    {
        return trimmed.to_string();
    }
    fallback.to_string()
}

#[tauri::command]
pub fn branding_update(
    state: State<AppState>,
    mut branding: BrandingConfig,
) -> Result<BrandingConfig, String> {
    let defaults = BrandingConfig::default();
    branding.brand_name = if branding.brand_name.trim().is_empty() {
        defaults.brand_name
    } else {
        branding.brand_name
    };
    branding.artist_name = if branding.artist_name.trim().is_empty() {
        defaults.artist_name
    } else {
        branding.artist_name
    };
    branding.logo_text = if branding.logo_text.trim().is_empty() {
        defaults.logo_text
    } else {
        branding.logo_text
    };
    branding.theme.bg_hex = sanitize_hex(&branding.theme.bg_hex, &defaults.theme.bg_hex);
    branding.theme.surface_hex =
        sanitize_hex(&branding.theme.surface_hex, &defaults.theme.surface_hex);
    branding.theme.panel_hex = sanitize_hex(&branding.theme.panel_hex, &defaults.theme.panel_hex);
    branding.theme.border_hex =
        sanitize_hex(&branding.theme.border_hex, &defaults.theme.border_hex);
    branding.theme.text_hex = sanitize_hex(&branding.theme.text_hex, &defaults.theme.text_hex);
    branding.theme.text_muted_hex = sanitize_hex(
        &branding.theme.text_muted_hex,
        &defaults.theme.text_muted_hex,
    );
    branding.theme.accent_hex =
        sanitize_hex(&branding.theme.accent_hex, &defaults.theme.accent_hex);
    branding.theme.cyan_hex = sanitize_hex(&branding.theme.cyan_hex, &defaults.theme.cyan_hex);
    branding.theme.magenta_hex =
        sanitize_hex(&branding.theme.magenta_hex, &defaults.theme.magenta_hex);
    branding.theme.amber_hex = sanitize_hex(&branding.theme.amber_hex, &defaults.theme.amber_hex);
    if branding.performance_palette.is_empty() {
        branding.performance_palette = defaults.performance_palette;
    }
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.branding = branding.clone();
    Ok(branding)
}

// ---------------------------------------------------------------------------
// Phase 6: DJ decks / library / crates / sync / pads / setlists / triggers
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn library_item_analyze_upsert(
    state: State<AppState>,
    media_asset_id: String,
) -> Result<LibraryItem, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let asset = project
        .media
        .iter()
        .find(|entry| entry.id == media_asset_id)
        .cloned()
        .ok_or("Media asset not found")?;

    let mut analyzed = deck::analyze_asset_to_library_item(&asset, project.bpm, now_unix_ms());
    if let Some(existing) = project
        .library_items
        .iter()
        .find(|entry| entry.media_asset_id == media_asset_id)
        .cloned()
    {
        analyzed.id = existing.id;
        if !existing.cue_points.is_empty() {
            analyzed.cue_points = existing.cue_points;
        }
        if !existing.saved_loops.is_empty() {
            analyzed.saved_loops = existing.saved_loops;
        }
        analyzed.last_played_unix_ms = existing.last_played_unix_ms;
        analyzed.play_count = existing.play_count;
        analyzed.comment = existing.comment;
        analyzed.rating = existing.rating;
        analyzed.genre = existing.genre;
        analyzed.album = existing.album;
    }

    if let Some(slot) = project
        .library_items
        .iter_mut()
        .find(|entry| entry.id == analyzed.id)
    {
        *slot = analyzed.clone();
    } else {
        project.library_items.push(analyzed.clone());
    }
    Ok(analyzed)
}

#[tauri::command]
pub fn library_item_update(
    state: State<AppState>,
    item: LibraryItem,
) -> Result<LibraryItem, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    if let Some(slot) = project
        .library_items
        .iter_mut()
        .find(|entry| entry.id == item.id)
    {
        *slot = item.clone();
    } else {
        project.library_items.push(item.clone());
    }
    Ok(item)
}

#[tauri::command]
pub fn crate_upsert(state: State<AppState>, mut crate_config: Crate) -> Result<Crate, String> {
    crate_config.name = if crate_config.name.trim().is_empty() {
        "Crate".to_string()
    } else {
        crate_config.name
    };
    let mut project = state.project.lock().map_err(|_| "lock")?;
    if let Some(slot) = project
        .crates
        .iter_mut()
        .find(|entry| entry.id == crate_config.id)
    {
        *slot = crate_config.clone();
    } else {
        project.crates.push(crate_config.clone());
    }
    Ok(crate_config)
}

#[tauri::command]
pub fn crate_remove(state: State<AppState>, crate_id: String) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.crates.retain(|entry| entry.id != crate_id);
    Ok(())
}

#[tauri::command]
pub fn crate_item_add(
    state: State<AppState>,
    crate_id: String,
    item_id: String,
) -> Result<Crate, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    if !project
        .library_items
        .iter()
        .any(|entry| entry.id == item_id)
    {
        return Err("Library item not found".to_string());
    }
    let crate_state = project
        .crates
        .iter_mut()
        .find(|entry| entry.id == crate_id)
        .ok_or("Crate not found")?;
    if !crate_state.item_ids.contains(&item_id) {
        crate_state.item_ids.push(item_id);
    }
    Ok(crate_state.clone())
}

#[tauri::command]
pub fn crate_item_remove(
    state: State<AppState>,
    crate_id: String,
    item_id: String,
) -> Result<Crate, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let crate_state = project
        .crates
        .iter_mut()
        .find(|entry| entry.id == crate_id)
        .ok_or("Crate not found")?;
    crate_state.item_ids.retain(|entry| entry != &item_id);
    Ok(crate_state.clone())
}

#[tauri::command]
pub fn deck_load_track(
    state: State<AppState>,
    deck_id: String,
    library_item_id: String,
) -> Result<DeckState, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let item = project
        .library_items
        .iter()
        .find(|entry| entry.id == library_item_id)
        .cloned()
        .ok_or("Library item not found")?;
    if !project
        .media
        .iter()
        .any(|entry| entry.id == item.media_asset_id)
    {
        return Err("Media asset not found".to_string());
    }
    let project_bpm = project.bpm.max(1.0);
    let sync_quantize_beats = project.deck_sync.sync_quantize_beats.max(1);
    let target_bpm = item.bpm.unwrap_or(project.bpm);
    let deck_state = find_deck_mut(&mut project, &deck_id)?;
    deck_state.loaded_track = Some(DeckTrackReference {
        library_item_id: item.id.clone(),
        media_asset_id: item.media_asset_id.clone(),
    });
    deck_state.playing = false;
    deck_state.position_secs = 0.0;
    deck_state.tempo_bpm = target_bpm;
    deck_state.tempo_multiplier = (target_bpm / project_bpm).clamp(0.5, 2.0);
    deck_state.hot_cues = item.cue_points.clone();
    deck_state.loop_state = item.saved_loops.first().cloned();
    deck_state.quantize_beats = sync_quantize_beats;
    deck_state.beat_phase = 0.0;
    Ok(deck_state.clone())
}

#[tauri::command]
pub fn deck_set_playing(
    state: State<AppState>,
    deck_id: String,
    playing: bool,
) -> Result<DeckState, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let normalized = normalize_deck_id(&deck_id);
    let loaded_ref = {
        let deck_state = find_deck_mut(&mut project, &normalized)?;
        deck_state.playing = playing;
        deck_state.loaded_track.clone()
    };

    if playing {
        if let Some(reference) = loaded_ref {
            if let Some(item) = project
                .library_items
                .iter_mut()
                .find(|entry| entry.id == reference.library_item_id)
            {
                item.last_played_unix_ms = Some(now_unix_ms());
                item.play_count = item.play_count.saturating_add(1);
            }
        }
    }

    let event_name = if playing { "deck_start" } else { "deck_stop" };
    let trigger_ids: Vec<String> = project
        .deck_event_bindings
        .iter()
        .filter(|binding| {
            binding.enabled
                && binding.event.eq_ignore_ascii_case(event_name)
                && binding
                    .deck_id
                    .as_ref()
                    .is_none_or(|entry| entry.eq_ignore_ascii_case(normalized.as_str()))
        })
        .map(|binding| binding.show_trigger_id.clone())
        .collect();
    for trigger_id in trigger_ids {
        let _ = execute_show_trigger(&mut project, &trigger_id);
    }

    Ok(find_deck(&project, &normalized)?.clone())
}

#[tauri::command]
pub fn deck_seek_position(
    state: State<AppState>,
    deck_id: String,
    position_secs: f64,
) -> Result<DeckState, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let deck_state = find_deck_mut(&mut project, &deck_id)?;
    deck_state.position_secs = position_secs.max(0.0);
    Ok(deck_state.clone())
}

#[tauri::command]
pub fn deck_turntable_nudge(
    state: State<AppState>,
    deck_id: String,
    delta_beats: f64,
) -> Result<DeckState, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let deck_state = find_deck_mut(&mut project, &deck_id)?;
    let beat_secs = 60.0 / deck_state.tempo_bpm.max(1.0);
    let delta_secs = delta_beats * beat_secs * deck_state.jog_sensitivity.clamp(0.1, 3.0);
    deck_state.position_secs = (deck_state.position_secs + delta_secs).max(0.0);
    deck_state.beat_phase = (deck_state.beat_phase + delta_beats).rem_euclid(1.0);
    Ok(deck_state.clone())
}

#[tauri::command]
pub fn deck_turntable_scratch(
    state: State<AppState>,
    deck_id: String,
    delta_secs: f64,
    friction: Option<f64>,
) -> Result<DeckState, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let deck_state = find_deck_mut(&mut project, &deck_id)?;
    if !deck_state.vinyl_mode {
        return Err("Vinyl mode disabled for this deck".to_string());
    }
    let friction = friction.unwrap_or(0.85).clamp(0.2, 0.99);
    let adjusted =
        delta_secs * (1.0 - friction + 0.15) * deck_state.jog_sensitivity.clamp(0.1, 3.0);
    deck_state.position_secs = (deck_state.position_secs + adjusted).max(0.0);
    let beat_secs = 60.0 / deck_state.tempo_bpm.max(1.0);
    deck_state.beat_phase = (deck_state.beat_phase + adjusted / beat_secs).rem_euclid(1.0);
    Ok(deck_state.clone())
}

#[tauri::command]
pub fn deck_turntable_configure(
    state: State<AppState>,
    deck_id: String,
    vinyl_mode: bool,
    jog_sensitivity: f64,
) -> Result<DeckState, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let deck_state = find_deck_mut(&mut project, &deck_id)?;
    deck_state.vinyl_mode = vinyl_mode;
    deck_state.jog_sensitivity = jog_sensitivity.clamp(0.1, 3.0);
    Ok(deck_state.clone())
}

#[tauri::command]
pub fn deck_hot_cue_set(
    state: State<AppState>,
    deck_id: String,
    label: String,
    position_secs: f64,
    color_hex: Option<String>,
) -> Result<CuePoint, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let cue = CuePoint {
        id: Uuid::new_v4().to_string(),
        label: if label.trim().is_empty() {
            "Cue".to_string()
        } else {
            label
        },
        position_secs: position_secs.max(0.0),
        color_hex,
    };

    let (loaded_reference, hot_cues_snapshot) = {
        let deck_state = find_deck_mut(&mut project, &deck_id)?;
        deck_state.hot_cues.push(cue.clone());
        deck_state.hot_cues.sort_by(|a, b| {
            a.position_secs
                .partial_cmp(&b.position_secs)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        (deck_state.loaded_track.clone(), deck_state.hot_cues.clone())
    };

    if let Some(reference) = loaded_reference {
        if let Some(item) = project
            .library_items
            .iter_mut()
            .find(|entry| entry.id == reference.library_item_id)
        {
            item.cue_points = hot_cues_snapshot;
        }
    }
    Ok(cue)
}

#[tauri::command]
pub fn deck_hot_cue_trigger(
    state: State<AppState>,
    deck_id: String,
    cue_id: String,
) -> Result<DeckState, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let position = {
        let deck_state = find_deck(&project, &deck_id)?;
        let cue = deck_state
            .hot_cues
            .iter()
            .find(|entry| entry.id == cue_id)
            .ok_or("Cue not found")?;
        cue.position_secs
    };
    {
        let deck_state = find_deck_mut(&mut project, &deck_id)?;
        deck_state.position_secs = position.max(0.0);
    }
    let trigger_ids: Vec<String> = project
        .deck_event_bindings
        .iter()
        .filter(|binding| {
            binding.enabled
                && binding.event.eq_ignore_ascii_case("cue_trigger")
                && binding
                    .deck_id
                    .as_ref()
                    .is_none_or(|entry| entry.eq_ignore_ascii_case(deck_id.as_str()))
        })
        .map(|binding| binding.show_trigger_id.clone())
        .collect();
    for trigger_id in trigger_ids {
        let _ = execute_show_trigger(&mut project, &trigger_id);
    }
    Ok(find_deck(&project, &deck_id)?.clone())
}

#[tauri::command]
pub fn deck_hot_cue_remove(
    state: State<AppState>,
    deck_id: String,
    cue_id: String,
) -> Result<DeckState, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let (loaded_reference, hot_cues_snapshot) = {
        let deck_state = find_deck_mut(&mut project, &deck_id)?;
        deck_state.hot_cues.retain(|entry| entry.id != cue_id);
        (deck_state.loaded_track.clone(), deck_state.hot_cues.clone())
    };
    if let Some(reference) = loaded_reference {
        if let Some(item) = project
            .library_items
            .iter_mut()
            .find(|entry| entry.id == reference.library_item_id)
        {
            item.cue_points = hot_cues_snapshot;
        }
    }
    Ok(find_deck(&project, &deck_id)?.clone())
}

#[tauri::command]
pub fn deck_loop_set(
    state: State<AppState>,
    deck_id: String,
    start_secs: f64,
    end_secs: f64,
    quantize_beats: u32,
) -> Result<LoopState, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let loop_state = LoopState {
        enabled: true,
        start_secs: start_secs.max(0.0),
        end_secs: end_secs.max(start_secs + 0.05),
        quantize_beats: quantize_beats.clamp(1, 16),
    };
    let loaded_reference = {
        let deck_state = find_deck_mut(&mut project, &deck_id)?;
        deck_state.loop_state = Some(loop_state.clone());
        deck_state.loaded_track.clone()
    };
    if let Some(reference) = loaded_reference {
        if let Some(item) = project
            .library_items
            .iter_mut()
            .find(|entry| entry.id == reference.library_item_id)
        {
            if !item.saved_loops.iter().any(|entry| {
                (entry.start_secs - loop_state.start_secs).abs() < 0.001
                    && (entry.end_secs - loop_state.end_secs).abs() < 0.001
            }) {
                item.saved_loops.push(loop_state.clone());
            }
        }
    }
    let trigger_ids: Vec<String> = project
        .deck_event_bindings
        .iter()
        .filter(|binding| {
            binding.enabled
                && binding.event.eq_ignore_ascii_case("loop_on")
                && binding
                    .deck_id
                    .as_ref()
                    .is_none_or(|entry| entry.eq_ignore_ascii_case(deck_id.as_str()))
        })
        .map(|binding| binding.show_trigger_id.clone())
        .collect();
    for trigger_id in trigger_ids {
        let _ = execute_show_trigger(&mut project, &trigger_id);
    }
    Ok(loop_state)
}

#[tauri::command]
pub fn deck_loop_clear(state: State<AppState>, deck_id: String) -> Result<DeckState, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let deck_state = find_deck_mut(&mut project, &deck_id)?;
    deck_state.loop_state = None;
    Ok(deck_state.clone())
}

#[tauri::command]
pub fn deck_sync_update(
    state: State<AppState>,
    mut sync: DeckSyncState,
) -> Result<DeckSyncState, String> {
    sync.sync_quantize_beats = sync.sync_quantize_beats.clamp(1, 16);
    sync.tempo_tolerance = sync.tempo_tolerance.clamp(0.0, 0.5);
    sync.master_deck_id = normalize_deck_id(&sync.master_deck_id);
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.deck_sync = sync.clone();
    Ok(sync)
}

#[tauri::command]
pub fn deck_sync_apply(
    state: State<AppState>,
    master_deck_id: String,
    follower_deck_id: String,
) -> Result<Vec<DeckState>, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let sync_quantize_beats = project.deck_sync.sync_quantize_beats;
    let master_idx = project
        .decks
        .iter()
        .position(|entry| entry.id.eq_ignore_ascii_case(master_deck_id.as_str()))
        .ok_or("Master deck not found")?;
    let follower_idx = project
        .decks
        .iter()
        .position(|entry| entry.id.eq_ignore_ascii_case(follower_deck_id.as_str()))
        .ok_or("Follower deck not found")?;
    if master_idx == follower_idx {
        return Err("Master and follower deck must be different".to_string());
    }
    let master = project.decks[master_idx].clone();
    let follower = project
        .decks
        .get_mut(follower_idx)
        .ok_or("Follower deck not found")?;
    deck::sync_follower(&master, follower, sync_quantize_beats);
    project.deck_sync.last_sync_unix_ms = Some(now_unix_ms());
    Ok(project.decks.clone())
}

#[tauri::command]
pub fn crossfader_update(
    state: State<AppState>,
    mut crossfader: CrossfaderState,
) -> Result<CrossfaderState, String> {
    crossfader.position = crossfader.position.clamp(-1.0, 1.0);
    crossfader.curve = crossfader.curve.clamp(0.0, 1.0);
    let (gain_a, gain_b) = deck::crossfader_gains(crossfader.position, crossfader.curve);
    crossfader.deck_a_gain = gain_a;
    crossfader.deck_b_gain = gain_b;

    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.performance_mode.crossfader = crossfader.position;
    for binding in &crossfader.track_bindings {
        if let Some(track) = project
            .tracks
            .iter_mut()
            .find(|entry| entry.id == binding.track_id)
        {
            let g = deck::side_gain(&binding.side, gain_a, gain_b).max(0.0001);
            track.volume_db = (20.0 * g.log10()).clamp(-60.0, 6.0);
        }
    }
    project.crossfader = crossfader.clone();
    Ok(crossfader)
}

#[tauri::command]
pub fn crossfader_bind_track(
    state: State<AppState>,
    track_id: String,
    side: CrossfaderSide,
) -> Result<CrossfaderState, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    if !project.tracks.iter().any(|track| track.id == track_id) {
        return Err("Track not found".to_string());
    }
    if let Some(existing) = project
        .crossfader
        .track_bindings
        .iter_mut()
        .find(|entry| entry.track_id == track_id)
    {
        existing.side = side;
    } else {
        project
            .crossfader
            .track_bindings
            .push(crate::models::CrossfaderTrackBinding { track_id, side });
    }
    let mut updated = project.crossfader.clone();
    let (gain_a, gain_b) = deck::crossfader_gains(updated.position, updated.curve);
    updated.deck_a_gain = gain_a;
    updated.deck_b_gain = gain_b;
    project.crossfader = updated.clone();
    Ok(updated)
}

#[tauri::command]
pub fn sampler_slot_upsert(
    state: State<AppState>,
    slot: SamplerSlot,
) -> Result<SamplerSlot, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    if let Some(item_id) = &slot.library_item_id {
        if !project.library_items.iter().any(|item| &item.id == item_id) {
            return Err("Sampler slot library item not found".to_string());
        }
    }
    if let Some(existing) = project
        .sampler_slots
        .iter_mut()
        .find(|entry| entry.id == slot.id)
    {
        *existing = slot.clone();
    } else {
        project.sampler_slots.push(slot.clone());
    }
    Ok(slot)
}

#[tauri::command]
pub fn sampler_slot_remove(state: State<AppState>, slot_id: String) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.sampler_slots.retain(|entry| entry.id != slot_id);
    for pad in &mut project.performance_pads {
        if pad.sampler_slot_id.as_deref() == Some(slot_id.as_str()) {
            pad.sampler_slot_id = None;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn performance_pad_upsert(
    state: State<AppState>,
    pad: PerformancePad,
) -> Result<PerformancePad, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    if let Some(existing) = project
        .performance_pads
        .iter_mut()
        .find(|entry| entry.id == pad.id)
    {
        *existing = pad.clone();
    } else {
        project.performance_pads.push(pad.clone());
    }
    Ok(pad)
}

#[tauri::command]
pub fn performance_pad_remove(state: State<AppState>, pad_id: String) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.performance_pads.retain(|entry| entry.id != pad_id);
    Ok(())
}

#[tauri::command]
pub fn performance_pad_trigger(
    state: State<AppState>,
    pad_id: String,
) -> Result<PerformancePad, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let project_bpm = project.bpm;
    let mut pad = project
        .performance_pads
        .iter()
        .find(|entry| entry.id == pad_id)
        .cloned()
        .ok_or("Pad not found")?;
    if !pad.enabled {
        return Err("Pad is disabled".to_string());
    }
    let now = now_unix_ms();

    if let Some(scene_id) = &pad.scene_id {
        project.session.active_scene_id = Some(scene_id.clone());
        project.performance_mode.selected_scene_id = Some(scene_id.clone());
    }

    if let Some(macro_id) = &pad.macro_id {
        if let Some(macro_config) = project
            .performance_macros
            .iter()
            .find(|entry| &entry.id == macro_id)
            .cloned()
        {
            for mute in &macro_config.track_mutes {
                if let Some(track) = project
                    .tracks
                    .iter_mut()
                    .find(|track| track.id == mute.track_id)
                {
                    track.muted = mute.muted;
                }
            }
            for send_override in &macro_config.send_overrides {
                if let Some(send) = project
                    .routing
                    .sends
                    .iter_mut()
                    .find(|send| send.id == send_override.send_id)
                {
                    send.amount = send_override.amount.clamp(0.0, 1.0);
                    send.enabled = send_override.enabled;
                }
            }
            project.performance_mode.active_macro_id = Some(macro_config.id);
        }
    }

    if let Some(slot_id) = &pad.sampler_slot_id {
        let item_to_load = project
            .sampler_slots
            .iter()
            .find(|entry| &entry.id == slot_id)
            .and_then(|slot| slot.library_item_id.as_ref())
            .and_then(|item_id| {
                project
                    .library_items
                    .iter()
                    .find(|entry| &entry.id == item_id)
            })
            .cloned();

        if let Some(item) = item_to_load {
            if let Some(empty_deck) = project
                .decks
                .iter_mut()
                .find(|deck| deck.loaded_track.is_none())
            {
                empty_deck.loaded_track = Some(DeckTrackReference {
                    library_item_id: item.id.clone(),
                    media_asset_id: item.media_asset_id.clone(),
                });
                empty_deck.hot_cues = item.cue_points.clone();
                empty_deck.tempo_bpm = item.bpm.unwrap_or(project_bpm);
            }
        }
    }

    if let Some(trigger_id) = &pad.show_trigger_id {
        let _ = execute_show_trigger(&mut project, trigger_id);
    }

    let binding_trigger_ids: Vec<String> = project
        .deck_event_bindings
        .iter()
        .filter(|entry| entry.enabled && entry.event.eq_ignore_ascii_case("pad_trigger"))
        .map(|entry| entry.show_trigger_id.clone())
        .collect();
    for trigger_id in binding_trigger_ids {
        let _ = execute_show_trigger(&mut project, &trigger_id);
    }

    pad.last_trigger_unix_ms = Some(now);
    if let Some(slot) = project
        .performance_pads
        .iter_mut()
        .find(|entry| entry.id == pad.id)
    {
        *slot = pad.clone();
    }
    Ok(pad)
}

#[tauri::command]
pub fn setlist_upsert(state: State<AppState>, setlist: Setlist) -> Result<Setlist, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    if let Some(existing) = project
        .setlists
        .iter_mut()
        .find(|entry| entry.id == setlist.id)
    {
        *existing = setlist.clone();
    } else {
        project.setlists.push(setlist.clone());
    }
    Ok(setlist)
}

#[tauri::command]
pub fn setlist_remove(state: State<AppState>, setlist_id: String) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.setlists.retain(|entry| entry.id != setlist_id);
    if project.active_setlist_id.as_deref() == Some(setlist_id.as_str()) {
        project.active_setlist_id = None;
    }
    Ok(())
}

#[tauri::command]
pub fn setlist_set_active(
    state: State<AppState>,
    setlist_id: Option<String>,
) -> Result<Option<String>, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    if let Some(id) = &setlist_id {
        if !project.setlists.iter().any(|entry| &entry.id == id) {
            return Err("Setlist not found".to_string());
        }
    }
    project.active_setlist_id = setlist_id.clone();
    Ok(setlist_id)
}

#[tauri::command]
pub fn setlist_entry_mark_played(
    state: State<AppState>,
    setlist_id: String,
    entry_id: String,
    played: bool,
) -> Result<Setlist, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let setlist = project
        .setlists
        .iter_mut()
        .find(|entry| entry.id == setlist_id)
        .ok_or("Setlist not found")?;
    let entry = setlist
        .entries
        .iter_mut()
        .find(|entry| entry.id == entry_id)
        .ok_or("Setlist entry not found")?;
    entry.played = played;
    if played {
        setlist.active_entry_id = Some(entry_id);
    }
    Ok(setlist.clone())
}

#[tauri::command]
pub fn show_trigger_upsert(
    state: State<AppState>,
    trigger: ShowTrigger,
) -> Result<ShowTrigger, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    if let Some(existing) = project
        .show_triggers
        .iter_mut()
        .find(|entry| entry.id == trigger.id)
    {
        *existing = trigger.clone();
    } else {
        project.show_triggers.push(trigger.clone());
    }
    Ok(trigger)
}

#[tauri::command]
pub fn show_trigger_remove(state: State<AppState>, trigger_id: String) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.show_triggers.retain(|entry| entry.id != trigger_id);
    project
        .deck_event_bindings
        .retain(|entry| entry.show_trigger_id != trigger_id);
    for pad in &mut project.performance_pads {
        if pad.show_trigger_id.as_deref() == Some(trigger_id.as_str()) {
            pad.show_trigger_id = None;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn show_trigger_execute(state: State<AppState>, trigger_id: String) -> Result<String, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    execute_show_trigger(&mut project, &trigger_id)
}

#[tauri::command]
pub fn deck_event_binding_upsert(
    state: State<AppState>,
    binding: DeckEventBinding,
) -> Result<DeckEventBinding, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    if !project
        .show_triggers
        .iter()
        .any(|entry| entry.id == binding.show_trigger_id)
    {
        return Err("Show trigger not found".to_string());
    }
    if let Some(existing) = project
        .deck_event_bindings
        .iter_mut()
        .find(|entry| entry.id == binding.id)
    {
        *existing = binding.clone();
    } else {
        project.deck_event_bindings.push(binding.clone());
    }
    Ok(binding)
}

#[tauri::command]
pub fn deck_event_binding_remove(state: State<AppState>, binding_id: String) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project
        .deck_event_bindings
        .retain(|entry| entry.id != binding_id);
    Ok(())
}

#[tauri::command]
pub fn deck_scene_link_upsert(
    state: State<AppState>,
    link: DeckSceneLink,
) -> Result<DeckSceneLink, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    if !project
        .session
        .scenes
        .iter()
        .any(|scene| scene.id == link.scene_id)
    {
        return Err("Scene not found".to_string());
    }
    if let Some(item_id) = &link.library_item_id {
        if !project
            .library_items
            .iter()
            .any(|entry| &entry.id == item_id)
        {
            return Err("Library item not found".to_string());
        }
    }
    if let Some(existing) = project
        .deck_scene_links
        .iter_mut()
        .find(|entry| entry.id == link.id)
    {
        *existing = link.clone();
    } else {
        project.deck_scene_links.push(link.clone());
    }
    Ok(link)
}

#[tauri::command]
pub fn deck_scene_link_remove(state: State<AppState>, link_id: String) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.deck_scene_links.retain(|entry| entry.id != link_id);
    Ok(())
}

#[tauri::command]
pub fn deck_scene_coordinate(
    state: State<AppState>,
    scene_id: String,
) -> Result<Vec<String>, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    if !project
        .session
        .scenes
        .iter()
        .any(|scene| scene.id == scene_id)
    {
        return Err("Scene not found".to_string());
    }
    project.session.active_scene_id = Some(scene_id.clone());
    let mut actions = vec![format!("Scene coordinated: {scene_id}")];

    let project_bpm = project.bpm;
    let links = project
        .deck_scene_links
        .iter()
        .filter(|entry| entry.scene_id == scene_id && entry.auto_load)
        .cloned()
        .collect::<Vec<_>>();
    for link in links {
        if let Some(item_id) = link.library_item_id {
            if let Some(item) = project
                .library_items
                .iter()
                .find(|entry| entry.id == item_id)
                .cloned()
            {
                if let Ok(deck_state) = find_deck_mut(&mut project, &link.preferred_deck_id) {
                    deck_state.loaded_track = Some(DeckTrackReference {
                        library_item_id: item.id.clone(),
                        media_asset_id: item.media_asset_id.clone(),
                    });
                    deck_state.hot_cues = item.cue_points;
                    deck_state.tempo_bpm = item.bpm.unwrap_or(project_bpm);
                    actions.push(format!("Loaded {} to deck {}", item.title, deck_state.id));
                }
            }
        }
    }

    let trigger_ids: Vec<String> = project
        .deck_event_bindings
        .iter()
        .filter(|entry| entry.enabled && entry.event.eq_ignore_ascii_case("scene_coordinate"))
        .map(|entry| entry.show_trigger_id.clone())
        .collect();
    for trigger_id in trigger_ids {
        if let Ok(payload) = execute_show_trigger(&mut project, &trigger_id) {
            actions.push(payload);
        }
    }
    Ok(actions)
}

// ---------------------------------------------------------------------------
// Phase 7: Show engine / DMX / sequencing / safety / dashboard
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn show_project_update(
    state: State<AppState>,
    mut show_project: ShowProject,
) -> Result<ShowProject, String> {
    show_project.dmx_bridge.fps_limit = show_project.dmx_bridge.fps_limit.clamp(1, 120);
    if show_project.dmx_bridge.port == 0 {
        show_project.dmx_bridge.port = 6454;
    }
    if show_project.dmx_universes.is_empty() {
        show_project
            .dmx_universes
            .push(crate::models::DmxUniverseState::new(0));
    }
    if show_project.dashboard.recent_events.len() > 64 {
        let keep_from = show_project
            .dashboard
            .recent_events
            .len()
            .saturating_sub(64);
        show_project.dashboard.recent_events =
            show_project.dashboard.recent_events.split_off(keep_from);
    }

    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.show_project = show_project.clone();
    refresh_show_dashboard(&mut project, now_unix_ms());
    Ok(show_project)
}

#[tauri::command]
pub fn dmx_bridge_update(
    state: State<AppState>,
    mut bridge: DmxBridgeConfig,
) -> Result<DmxBridgeConfig, String> {
    bridge.fps_limit = bridge.fps_limit.clamp(1, 120);
    if bridge.port == 0 {
        bridge.port = 6454;
    }
    if bridge.host.trim().is_empty() {
        bridge.host = "127.0.0.1".to_string();
    }
    if bridge.protocol.trim().is_empty() {
        bridge.protocol = "artnet".to_string();
    }
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project.show_project.dmx_bridge = bridge.clone();
    refresh_show_dashboard(&mut project, now_unix_ms());
    Ok(bridge)
}

#[tauri::command]
pub fn lighting_cue_upsert(
    state: State<AppState>,
    mut cue: LightingCue,
) -> Result<LightingCue, String> {
    cue.fade_ms = cue.fade_ms.min(120_000);
    cue.hold_ms = cue.hold_ms.min(120_000);
    cue.values
        .retain(|entry| entry.channel >= 1 && entry.channel <= 512);
    cue.values.sort_by_key(|entry| entry.channel);
    cue.values.dedup_by_key(|entry| entry.channel);
    cue.name = if cue.name.trim().is_empty() {
        "Lighting Cue".to_string()
    } else {
        cue.name
    };

    let mut project = state.project.lock().map_err(|_| "lock")?;
    if let Some(existing) = project
        .show_project
        .lighting_cues
        .iter_mut()
        .find(|entry| entry.id == cue.id)
    {
        *existing = cue.clone();
    } else {
        project.show_project.lighting_cues.push(cue.clone());
    }
    refresh_show_dashboard(&mut project, now_unix_ms());
    Ok(cue)
}

#[tauri::command]
pub fn lighting_cue_remove(state: State<AppState>, cue_id: String) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project
        .show_project
        .lighting_cues
        .retain(|entry| entry.id != cue_id);
    for sequence in &mut project.show_project.cue_sequences {
        for step in &mut sequence.steps {
            if step.lighting_cue_id.as_deref() == Some(cue_id.as_str()) {
                step.lighting_cue_id = None;
            }
        }
    }
    for trigger in &mut project.show_project.cue_triggers {
        if trigger.lighting_cue_id.as_deref() == Some(cue_id.as_str()) {
            trigger.lighting_cue_id = None;
        }
    }
    for map in &mut project.show_project.song_cue_maps {
        if map.lighting_cue_id.as_deref() == Some(cue_id.as_str()) {
            map.lighting_cue_id = None;
        }
    }
    refresh_show_dashboard(&mut project, now_unix_ms());
    Ok(())
}

#[tauri::command]
pub fn lighting_cue_execute(state: State<AppState>, cue_id: String) -> Result<String, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    let cue = project
        .show_project
        .lighting_cues
        .iter()
        .find(|entry| entry.id == cue_id)
        .cloned()
        .ok_or("Lighting cue not found")?;
    let bridge = project.show_project.dmx_bridge.clone();

    let result = show_control::execute_lighting_cue(
        &bridge,
        &mut project.show_project.dmx_universes,
        &cue,
        now,
    );
    match result {
        Ok(payload) => {
            show_control::push_dashboard_event(
                &mut project.show_project.dashboard,
                "lighting_cue",
                cue.name.as_str(),
                payload.as_str(),
                now,
            );
            refresh_show_dashboard(&mut project, now);
            Ok(payload)
        }
        Err(error) => {
            note_show_error(&mut project, "lighting_cue", error.as_str(), now);
            Err(error)
        }
    }
}

#[tauri::command]
pub fn visual_cue_upsert(state: State<AppState>, mut cue: VisualCue) -> Result<VisualCue, String> {
    if cue.host.trim().is_empty() {
        cue.host = "127.0.0.1".to_string();
    }
    if cue.port == 0 {
        cue.port = 7000;
    }
    if cue.address.trim().is_empty() {
        cue.address = "/devolution/visual".to_string();
    }
    cue.name = if cue.name.trim().is_empty() {
        "Visual Cue".to_string()
    } else {
        cue.name
    };

    let mut project = state.project.lock().map_err(|_| "lock")?;
    if let Some(existing) = project
        .show_project
        .visual_cues
        .iter_mut()
        .find(|entry| entry.id == cue.id)
    {
        *existing = cue.clone();
    } else {
        project.show_project.visual_cues.push(cue.clone());
    }
    refresh_show_dashboard(&mut project, now_unix_ms());
    Ok(cue)
}

#[tauri::command]
pub fn visual_cue_remove(state: State<AppState>, cue_id: String) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project
        .show_project
        .visual_cues
        .retain(|entry| entry.id != cue_id);
    for sequence in &mut project.show_project.cue_sequences {
        for step in &mut sequence.steps {
            if step.visual_cue_id.as_deref() == Some(cue_id.as_str()) {
                step.visual_cue_id = None;
            }
        }
    }
    for map in &mut project.show_project.song_cue_maps {
        if map.visual_cue_id.as_deref() == Some(cue_id.as_str()) {
            map.visual_cue_id = None;
        }
    }
    refresh_show_dashboard(&mut project, now_unix_ms());
    Ok(())
}

#[tauri::command]
pub fn visual_cue_execute(state: State<AppState>, cue_id: String) -> Result<String, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    let cue = project
        .show_project
        .visual_cues
        .iter()
        .find(|entry| entry.id == cue_id)
        .cloned()
        .ok_or("Visual cue not found")?;
    let result = show_control::send_visual_cue(&cue);
    match result {
        Ok(payload) => {
            show_control::push_dashboard_event(
                &mut project.show_project.dashboard,
                "visual_cue",
                cue.name.as_str(),
                payload.as_str(),
                now,
            );
            refresh_show_dashboard(&mut project, now);
            Ok(payload)
        }
        Err(error) => {
            note_show_error(&mut project, "visual_cue", error.as_str(), now);
            Err(error)
        }
    }
}

#[tauri::command]
pub fn cue_sequence_upsert(
    state: State<AppState>,
    mut sequence: CueSequence,
) -> Result<CueSequence, String> {
    sequence.name = if sequence.name.trim().is_empty() {
        "Cue Sequence".to_string()
    } else {
        sequence.name
    };
    for step in &mut sequence.steps {
        step.offset_beats = step.offset_beats.max(0.0);
        step.duration_beats = step.duration_beats.max(0.0);
    }
    sequence.steps.sort_by(|a, b| {
        a.offset_beats
            .partial_cmp(&b.offset_beats)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let mut project = state.project.lock().map_err(|_| "lock")?;
    if let Some(existing) = project
        .show_project
        .cue_sequences
        .iter_mut()
        .find(|entry| entry.id == sequence.id)
    {
        *existing = sequence.clone();
    } else {
        project.show_project.cue_sequences.push(sequence.clone());
    }
    refresh_show_dashboard(&mut project, now_unix_ms());
    Ok(sequence)
}

#[tauri::command]
pub fn cue_sequence_remove(state: State<AppState>, sequence_id: String) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project
        .show_project
        .cue_sequences
        .retain(|entry| entry.id != sequence_id);
    if project.show_project.active_sequence_id.as_deref() == Some(sequence_id.as_str()) {
        project.show_project.active_sequence_id = None;
        project.show_project.dashboard.last_sequence_beat = 0.0;
    }
    for trigger in &mut project.show_project.cue_triggers {
        if trigger.cue_sequence_id.as_deref() == Some(sequence_id.as_str()) {
            trigger.cue_sequence_id = None;
        }
    }
    for map in &mut project.show_project.song_cue_maps {
        if map.cue_sequence_id.as_deref() == Some(sequence_id.as_str()) {
            map.cue_sequence_id = None;
        }
    }
    refresh_show_dashboard(&mut project, now_unix_ms());
    Ok(())
}

#[tauri::command]
pub fn cue_sequence_start(
    state: State<AppState>,
    sequence_id: String,
) -> Result<CueSequence, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    let sequence = project
        .show_project
        .cue_sequences
        .iter()
        .find(|entry| entry.id == sequence_id)
        .cloned()
        .ok_or("Cue sequence not found")?;
    if !sequence.enabled {
        return Err("Cue sequence is disabled".to_string());
    }
    project.show_project.active_sequence_id = Some(sequence.id.clone());
    project.show_project.dashboard.active_sequence_id = Some(sequence.id.clone());
    project.show_project.dashboard.last_sequence_beat = 0.0;
    show_control::push_dashboard_event(
        &mut project.show_project.dashboard,
        "sequence",
        "start",
        sequence.name.as_str(),
        now,
    );
    refresh_show_dashboard(&mut project, now);
    Ok(sequence)
}

#[tauri::command]
pub fn cue_sequence_stop(state: State<AppState>) -> Result<Option<String>, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    let active = project.show_project.active_sequence_id.clone();
    project.show_project.active_sequence_id = None;
    project.show_project.dashboard.active_sequence_id = None;
    project.show_project.dashboard.last_sequence_beat = 0.0;
    if let Some(id) = &active {
        show_control::push_dashboard_event(
            &mut project.show_project.dashboard,
            "sequence",
            "stop",
            id.as_str(),
            now,
        );
    }
    refresh_show_dashboard(&mut project, now);
    Ok(active)
}

#[tauri::command]
pub fn cue_sequence_tick(
    state: State<AppState>,
    position_beats: f64,
) -> Result<Vec<String>, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    let sequence_id = project
        .show_project
        .active_sequence_id
        .clone()
        .ok_or("No active cue sequence")?;
    let sequence = project
        .show_project
        .cue_sequences
        .iter()
        .find(|entry| entry.id == sequence_id)
        .cloned()
        .ok_or("Active cue sequence not found")?;
    if !sequence.enabled {
        return Err("Active cue sequence is disabled".to_string());
    }

    let last_beat = project.show_project.dashboard.last_sequence_beat.max(0.0);
    let mut effective_last = last_beat;
    if position_beats < last_beat {
        effective_last = 0.0;
    }

    let mut actions = Vec::new();
    for step in sequence.steps.iter().filter(|entry| {
        entry.enabled && entry.offset_beats > effective_last && entry.offset_beats <= position_beats
    }) {
        if let Some(cue_id) = &step.lighting_cue_id {
            if let Some(cue) = project
                .show_project
                .lighting_cues
                .iter()
                .find(|entry| &entry.id == cue_id)
                .cloned()
            {
                let bridge = project.show_project.dmx_bridge.clone();
                match show_control::execute_lighting_cue(
                    &bridge,
                    &mut project.show_project.dmx_universes,
                    &cue,
                    now,
                ) {
                    Ok(payload) => {
                        actions.push(payload.clone());
                        show_control::push_dashboard_event(
                            &mut project.show_project.dashboard,
                            "sequence_step",
                            "lighting",
                            payload.as_str(),
                            now,
                        );
                    }
                    Err(error) => {
                        note_show_error(&mut project, "sequence_step", error.as_str(), now);
                        return Err(error);
                    }
                }
            }
        }
        if let Some(trigger_id) = &step.show_trigger_id {
            let payload = execute_show_trigger(&mut project, trigger_id)?;
            actions.push(payload);
        }
        if let Some(visual_cue_id) = &step.visual_cue_id {
            if let Some(cue) = project
                .show_project
                .visual_cues
                .iter()
                .find(|entry| &entry.id == visual_cue_id)
                .cloned()
            {
                match show_control::send_visual_cue(&cue) {
                    Ok(payload) => {
                        actions.push(payload.clone());
                        show_control::push_dashboard_event(
                            &mut project.show_project.dashboard,
                            "sequence_step",
                            "visual",
                            payload.as_str(),
                            now,
                        );
                    }
                    Err(error) => {
                        note_show_error(&mut project, "sequence_step", error.as_str(), now);
                        return Err(error);
                    }
                }
            }
        }
    }

    project.show_project.dashboard.last_sequence_beat = position_beats.max(0.0);
    refresh_show_dashboard(&mut project, now);
    if actions.is_empty() {
        actions.push(format!(
            "No sequence steps fired for beat window {:.2} -> {:.2}",
            effective_last, position_beats
        ));
    }
    Ok(actions)
}

#[tauri::command]
pub fn cue_trigger_upsert(
    state: State<AppState>,
    mut trigger: CueTrigger,
) -> Result<CueTrigger, String> {
    trigger.quantize_beats = trigger.quantize_beats.clamp(1, 16);
    trigger.name = if trigger.name.trim().is_empty() {
        "Cue Trigger".to_string()
    } else {
        trigger.name
    };
    let mut project = state.project.lock().map_err(|_| "lock")?;
    if let Some(existing) = project
        .show_project
        .cue_triggers
        .iter_mut()
        .find(|entry| entry.id == trigger.id)
    {
        *existing = trigger.clone();
    } else {
        project.show_project.cue_triggers.push(trigger.clone());
    }
    refresh_show_dashboard(&mut project, now_unix_ms());
    Ok(trigger)
}

#[tauri::command]
pub fn cue_trigger_remove(state: State<AppState>, trigger_id: String) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project
        .show_project
        .cue_triggers
        .retain(|entry| entry.id != trigger_id);
    refresh_show_dashboard(&mut project, now_unix_ms());
    Ok(())
}

#[tauri::command]
pub fn cue_trigger_fire(state: State<AppState>, trigger_id: String) -> Result<Vec<String>, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    let trigger = project
        .show_project
        .cue_triggers
        .iter()
        .find(|entry| entry.id == trigger_id)
        .cloned()
        .ok_or("Cue trigger not found")?;
    if !trigger.enabled {
        return Err("Cue trigger is disabled".to_string());
    }
    let mut actions = vec![format!("Fired trigger {}", trigger.name)];

    if let Some(sequence_id) = &trigger.cue_sequence_id {
        if project
            .show_project
            .cue_sequences
            .iter()
            .any(|sequence| sequence.id == *sequence_id)
        {
            project.show_project.active_sequence_id = Some(sequence_id.clone());
            project.show_project.dashboard.active_sequence_id = Some(sequence_id.clone());
            project.show_project.dashboard.last_sequence_beat = 0.0;
            actions.push(format!("Started sequence {sequence_id}"));
        }
    }
    if let Some(cue_id) = &trigger.lighting_cue_id {
        if let Some(cue) = project
            .show_project
            .lighting_cues
            .iter()
            .find(|entry| entry.id == *cue_id)
            .cloned()
        {
            let bridge = project.show_project.dmx_bridge.clone();
            let payload = show_control::execute_lighting_cue(
                &bridge,
                &mut project.show_project.dmx_universes,
                &cue,
                now,
            )?;
            actions.push(payload);
        }
    }
    show_control::push_dashboard_event(
        &mut project.show_project.dashboard,
        "cue_trigger",
        trigger.trigger_event.as_str(),
        trigger.name.as_str(),
        now,
    );
    refresh_show_dashboard(&mut project, now);
    Ok(actions)
}

#[tauri::command]
pub fn song_cue_map_upsert(
    state: State<AppState>,
    mut map: SongCueMap,
) -> Result<SongCueMap, String> {
    map.transition_event = if map.transition_event.trim().is_empty() {
        "scene_change".to_string()
    } else {
        map.transition_event
    };
    let mut project = state.project.lock().map_err(|_| "lock")?;
    if let Some(existing) = project
        .show_project
        .song_cue_maps
        .iter_mut()
        .find(|entry| entry.id == map.id)
    {
        *existing = map.clone();
    } else {
        project.show_project.song_cue_maps.push(map.clone());
    }
    refresh_show_dashboard(&mut project, now_unix_ms());
    Ok(map)
}

#[tauri::command]
pub fn song_cue_map_remove(state: State<AppState>, map_id: String) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project
        .show_project
        .song_cue_maps
        .retain(|entry| entry.id != map_id);
    refresh_show_dashboard(&mut project, now_unix_ms());
    Ok(())
}

#[tauri::command]
pub fn song_cue_map_trigger(
    state: State<AppState>,
    scene_id: Option<String>,
    library_item_id: Option<String>,
    transition_event: String,
) -> Result<Vec<String>, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    let maps = project
        .show_project
        .song_cue_maps
        .iter()
        .filter(|entry| {
            entry.enabled
                && entry
                    .transition_event
                    .eq_ignore_ascii_case(transition_event.as_str())
                && entry
                    .scene_id
                    .as_ref()
                    .is_none_or(|id| scene_id.as_ref().is_some_and(|candidate| candidate == id))
                && entry.library_item_id.as_ref().is_none_or(|id| {
                    library_item_id
                        .as_ref()
                        .is_some_and(|candidate| candidate == id)
                })
        })
        .cloned()
        .collect::<Vec<_>>();
    let mut actions = vec![];

    for map in maps {
        if let Some(sequence_id) = &map.cue_sequence_id {
            if project
                .show_project
                .cue_sequences
                .iter()
                .any(|sequence| &sequence.id == sequence_id)
            {
                project.show_project.active_sequence_id = Some(sequence_id.clone());
                project.show_project.dashboard.active_sequence_id = Some(sequence_id.clone());
                project.show_project.dashboard.last_sequence_beat = 0.0;
                actions.push(format!("Map started sequence {sequence_id}"));
            }
        }
        if let Some(cue_id) = &map.lighting_cue_id {
            if let Some(cue) = project
                .show_project
                .lighting_cues
                .iter()
                .find(|entry| &entry.id == cue_id)
                .cloned()
            {
                let bridge = project.show_project.dmx_bridge.clone();
                let payload = show_control::execute_lighting_cue(
                    &bridge,
                    &mut project.show_project.dmx_universes,
                    &cue,
                    now,
                )?;
                actions.push(payload);
            }
        }
        if let Some(visual_id) = &map.visual_cue_id {
            if let Some(cue) = project
                .show_project
                .visual_cues
                .iter()
                .find(|entry| &entry.id == visual_id)
                .cloned()
            {
                let payload = show_control::send_visual_cue(&cue)?;
                actions.push(payload);
            }
        }
    }
    if actions.is_empty() {
        actions.push("No song cue mappings matched trigger context".to_string());
    }
    show_control::push_dashboard_event(
        &mut project.show_project.dashboard,
        "song_map",
        transition_event.as_str(),
        actions.join(" | ").as_str(),
        now,
    );
    refresh_show_dashboard(&mut project, now);
    Ok(actions)
}

#[tauri::command]
pub fn device_binding_upsert(
    state: State<AppState>,
    binding: DeviceBinding,
) -> Result<DeviceBinding, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    if binding.midi_binding.is_none()
        && binding.osc_binding.is_none()
        && binding.dmx_binding.is_none()
        && binding.target_trigger_id.is_none()
        && binding.target_sequence_id.is_none()
    {
        return Err("Device binding has no signal or target mapping".to_string());
    }
    if let Some(existing) = project
        .show_project
        .device_bindings
        .iter_mut()
        .find(|entry| entry.id == binding.id)
    {
        *existing = binding.clone();
    } else {
        project.show_project.device_bindings.push(binding.clone());
    }
    refresh_show_dashboard(&mut project, now_unix_ms());
    Ok(binding)
}

#[tauri::command]
pub fn device_binding_remove(state: State<AppState>, binding_id: String) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project
        .show_project
        .device_bindings
        .retain(|entry| entry.id != binding_id);
    refresh_show_dashboard(&mut project, now_unix_ms());
    Ok(())
}

#[tauri::command]
pub fn device_binding_test(state: State<AppState>, binding_id: String) -> Result<String, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    let binding = project
        .show_project
        .device_bindings
        .iter()
        .find(|entry| entry.id == binding_id)
        .cloned()
        .ok_or("Device binding not found")?;
    if !binding.enabled {
        return Err("Device binding is disabled".to_string());
    }

    if let Some(trigger_id) = &binding.target_trigger_id {
        let payload = execute_show_trigger(&mut project, trigger_id)?;
        refresh_show_dashboard(&mut project, now);
        return Ok(format!("Binding trigger routed: {payload}"));
    }

    if let Some(sequence_id) = &binding.target_sequence_id {
        if !project
            .show_project
            .cue_sequences
            .iter()
            .any(|entry| &entry.id == sequence_id)
        {
            return Err("Target sequence not found".to_string());
        }
        project.show_project.active_sequence_id = Some(sequence_id.clone());
        project.show_project.dashboard.active_sequence_id = Some(sequence_id.clone());
        project.show_project.dashboard.last_sequence_beat = 0.0;
        refresh_show_dashboard(&mut project, now);
        return Ok(format!("Binding started cue sequence {sequence_id}"));
    }

    if let Some(midi) = &binding.midi_binding {
        let payload = show_control::execute_show_trigger(&ShowTrigger {
            id: "binding-test".to_string(),
            name: binding.name.clone(),
            enabled: true,
            value: 1.0,
            quantize_beats: 1,
            osc_binding: None,
            midi_binding: Some(midi.clone()),
        })?;
        show_control::push_dashboard_event(
            &mut project.show_project.dashboard,
            "device_binding",
            "midi_test",
            payload.as_str(),
            now,
        );
        refresh_show_dashboard(&mut project, now);
        return Ok(payload);
    }

    if let Some(osc) = &binding.osc_binding {
        let payload = show_control::execute_show_trigger(&ShowTrigger {
            id: "binding-test".to_string(),
            name: binding.name.clone(),
            enabled: true,
            value: 1.0,
            quantize_beats: 1,
            osc_binding: Some(osc.clone()),
            midi_binding: None,
        })?;
        show_control::push_dashboard_event(
            &mut project.show_project.dashboard,
            "device_binding",
            "osc_test",
            payload.as_str(),
            now,
        );
        refresh_show_dashboard(&mut project, now);
        return Ok(payload);
    }

    if let Some(dmx) = &binding.dmx_binding {
        let cue = LightingCue {
            id: "binding-test".to_string(),
            name: format!("Binding {}", binding.name),
            universe: dmx.universe,
            values: vec![crate::models::LightingChannelValue {
                channel: dmx.channel,
                value: dmx.value,
            }],
            fade_ms: 0,
            hold_ms: 0,
            tags: vec!["binding_test".to_string()],
            enabled: true,
        };
        let bridge = project.show_project.dmx_bridge.clone();
        let payload = show_control::execute_lighting_cue(
            &bridge,
            &mut project.show_project.dmx_universes,
            &cue,
            now,
        )?;
        show_control::push_dashboard_event(
            &mut project.show_project.dashboard,
            "device_binding",
            "dmx_test",
            payload.as_str(),
            now,
        );
        refresh_show_dashboard(&mut project, now);
        return Ok(payload);
    }

    Err("Device binding has no executable target".to_string())
}

#[tauri::command]
pub fn fallback_profile_upsert(
    state: State<AppState>,
    mut profile: FallbackProfile,
) -> Result<FallbackProfile, String> {
    profile.name = if profile.name.trim().is_empty() {
        "Fallback Profile".to_string()
    } else {
        profile.name
    };
    let mut project = state.project.lock().map_err(|_| "lock")?;
    if profile.dmx_universes.is_empty() {
        profile.dmx_universes = project.show_project.dmx_universes.clone();
    }
    if let Some(existing) = project
        .show_project
        .fallback_profiles
        .iter_mut()
        .find(|entry| entry.id == profile.id)
    {
        *existing = profile.clone();
    } else {
        project.show_project.fallback_profiles.push(profile.clone());
    }
    refresh_show_dashboard(&mut project, now_unix_ms());
    Ok(profile)
}

#[tauri::command]
pub fn fallback_profile_remove(state: State<AppState>, profile_id: String) -> Result<(), String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    project
        .show_project
        .fallback_profiles
        .retain(|entry| entry.id != profile_id);
    refresh_show_dashboard(&mut project, now_unix_ms());
    Ok(())
}

#[tauri::command]
pub fn fallback_profile_apply(
    state: State<AppState>,
    profile_id: String,
) -> Result<FallbackProfile, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    let profile = project
        .show_project
        .fallback_profiles
        .iter()
        .find(|entry| entry.id == profile_id)
        .cloned()
        .ok_or("Fallback profile not found")?;
    project.show_project.dmx_universes = profile.dmx_universes.clone();
    if let Some(scene_id) = &profile.scene_id {
        project.session.active_scene_id = Some(scene_id.clone());
    }
    let _ = show_control::flush_dmx_universes(
        &project.show_project.dmx_bridge,
        &project.show_project.dmx_universes,
    );
    show_control::push_dashboard_event(
        &mut project.show_project.dashboard,
        "fallback",
        "apply",
        profile.name.as_str(),
        now,
    );
    refresh_show_dashboard(&mut project, now);
    Ok(profile)
}

#[tauri::command]
pub fn safety_blackout_set(
    state: State<AppState>,
    enabled: bool,
    fade_ms: u32,
) -> Result<BlackoutState, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    project.show_project.safety_state.blackout.enabled = enabled;
    project.show_project.safety_state.blackout.fade_ms = fade_ms.min(10_000);
    project
        .show_project
        .safety_state
        .blackout
        .last_update_unix_ms = Some(now);
    show_control::apply_blackout(&mut project.show_project.dmx_universes, enabled, now);
    if let Err(error) = show_control::flush_dmx_universes(
        &project.show_project.dmx_bridge,
        &project.show_project.dmx_universes,
    ) {
        note_show_error(&mut project, "blackout", error.as_str(), now);
        return Err(error);
    }
    show_control::push_dashboard_event(
        &mut project.show_project.dashboard,
        "safety",
        if enabled {
            "blackout_on"
        } else {
            "blackout_off"
        },
        "Blackout state updated",
        now,
    );
    refresh_show_dashboard(&mut project, now);
    Ok(project.show_project.safety_state.blackout.clone())
}

#[tauri::command]
pub fn safety_panic(
    state: State<AppState>,
    action: Option<PanicAction>,
) -> Result<SafetyState, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    let panic_action = action.unwrap_or_default();
    project.show_project.safety_state.panic_active = true;
    project.show_project.safety_state.last_action = Some("panic".to_string());

    if panic_action.stop_transport {
        state.playback.stop();
    }
    if panic_action.stop_decks {
        for deck_state in &mut project.decks {
            deck_state.playing = false;
        }
    }
    if panic_action.reset_sequences {
        project.show_project.active_sequence_id = None;
        project.show_project.dashboard.active_sequence_id = None;
        project.show_project.dashboard.last_sequence_beat = 0.0;
    }
    if panic_action.blackout {
        project.show_project.safety_state.blackout.enabled = true;
        project
            .show_project
            .safety_state
            .blackout
            .last_update_unix_ms = Some(now);
        show_control::apply_blackout(&mut project.show_project.dmx_universes, true, now);
        let _ = show_control::flush_dmx_universes(
            &project.show_project.dmx_bridge,
            &project.show_project.dmx_universes,
        );
    }
    if panic_action.apply_fallback {
        if let Some(profile) = project.show_project.fallback_profiles.first().cloned() {
            project.show_project.dmx_universes = profile.dmx_universes;
            if let Some(scene_id) = profile.scene_id {
                project.session.active_scene_id = Some(scene_id);
            }
        }
    }

    show_control::push_dashboard_event(
        &mut project.show_project.dashboard,
        "safety",
        "panic",
        "Panic action executed",
        now,
    );
    refresh_show_dashboard(&mut project, now);
    Ok(project.show_project.safety_state.clone())
}

#[tauri::command]
pub fn safety_reset(state: State<AppState>) -> Result<SafetyState, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    project.show_project.safety_state.panic_active = false;
    project.show_project.safety_state.blackout.enabled = false;
    project.show_project.safety_state.last_action = Some("reset".to_string());
    project.show_project.safety_state.last_error = None;
    project.show_project.active_sequence_id = None;
    project.show_project.dashboard.active_sequence_id = None;
    project.show_project.dashboard.last_sequence_beat = 0.0;
    show_control::apply_blackout(&mut project.show_project.dmx_universes, false, now);
    let _ = show_control::flush_dmx_universes(
        &project.show_project.dmx_bridge,
        &project.show_project.dmx_universes,
    );
    show_control::push_dashboard_event(
        &mut project.show_project.dashboard,
        "safety",
        "reset",
        "Safety reset executed",
        now,
    );
    refresh_show_dashboard(&mut project, now);
    Ok(project.show_project.safety_state.clone())
}

#[tauri::command]
pub fn performance_dashboard_refresh(
    state: State<AppState>,
) -> Result<PerformanceDashboardState, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    refresh_show_dashboard(&mut project, now);
    refresh_system_health(&mut project, now);
    Ok(project.show_project.dashboard.clone())
}

// ---------------------------------------------------------------------------
// Phase 8: Integration / diagnostics / migration / RC operations
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn navigation_update(
    state: State<AppState>,
    mut navigation: NavigationState,
) -> Result<NavigationState, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    if navigation.main_view.trim().is_empty() {
        navigation.main_view = app_mode_default_main_view(&navigation.active_mode).to_string();
    }
    navigation.last_route_unix_ms = Some(now);
    project.navigation = navigation.clone();
    refresh_system_health(&mut project, now);
    Ok(navigation)
}

#[tauri::command]
pub fn preferences_update(
    state: State<AppState>,
    mut preferences: UserPreferences,
) -> Result<UserPreferences, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    preferences.ui_scale = preferences.ui_scale.clamp(0.8, 1.5);
    project.preferences = preferences.clone();
    refresh_system_health(&mut project, now_unix_ms());
    Ok(preferences)
}

#[tauri::command]
pub fn device_profiles_refresh(state: State<AppState>) -> Result<Vec<DeviceProfile>, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    project.device_profiles = build_device_profiles(&project, now);
    if project.device_profiles.is_empty() {
        project.device_diagnostics.warnings =
            vec!["No devices discovered by runtime scan.".to_string()];
    }
    refresh_system_health(&mut project, now);
    Ok(project.device_profiles.clone())
}

#[tauri::command]
pub fn device_diagnostics_run(state: State<AppState>) -> Result<DeviceDiagnosticState, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    let audio_input_devices = crate::audio::recording::list_input_devices().unwrap_or_default();
    let midi_binding_count = project
        .show_project
        .device_bindings
        .iter()
        .filter(|binding| binding.midi_binding.is_some())
        .count() as u32;
    let osc_binding_count = project
        .show_project
        .device_bindings
        .iter()
        .filter(|binding| binding.osc_binding.is_some())
        .count() as u32;
    let dmx_universe_count = project.show_project.dmx_universes.len() as u32;

    let mut warnings = vec![];
    let mut errors = vec![];
    if audio_input_devices.is_empty() {
        warnings.push("No audio input devices detected.".to_string());
    }
    if project.show_project.dmx_bridge.enabled && project.show_project.dmx_universes.is_empty() {
        errors.push("DMX bridge enabled with no universes configured.".to_string());
    }
    if project.monitoring.target_buffer_ms > 512 {
        warnings.push("Monitoring buffer exceeds 512 ms.".to_string());
    }
    if project.show_project.safety_state.panic_active {
        errors.push("Panic state is active.".to_string());
    }

    project.device_diagnostics = DeviceDiagnosticState {
        last_run_unix_ms: Some(now),
        audio_input_devices,
        warnings,
        errors: errors.clone(),
        midi_binding_count,
        osc_binding_count,
        dmx_universe_count,
        healthy: errors.is_empty(),
    };
    project.device_profiles = build_device_profiles(&project, now);
    refresh_system_health(&mut project, now);
    Ok(project.device_diagnostics.clone())
}

#[tauri::command]
pub fn compatibility_report_generate(
    state: State<AppState>,
) -> Result<CompatibilityReport, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let report = generate_compatibility_report(&project, now_unix_ms());
    project.compatibility_reports.push(report.clone());
    if project.compatibility_reports.len() > 64 {
        let len = project.compatibility_reports.len();
        project.compatibility_reports.drain(0..len - 64);
    }
    refresh_system_health(&mut project, now_unix_ms());
    Ok(report)
}

#[tauri::command]
pub fn migration_plan_generate(
    state: State<AppState>,
    target_version: Option<u32>,
) -> Result<MigrationPlan, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    let target = target_version.unwrap_or(crate::models::PROJECT_SCHEMA_VERSION);
    let plan = build_migration_plan(&project, now, target);
    project.migration_history.push(plan.clone());
    if project.migration_history.len() > 32 {
        let len = project.migration_history.len();
        project.migration_history.drain(0..len - 32);
    }
    refresh_system_health(&mut project, now);
    Ok(plan)
}

#[tauri::command]
pub fn migration_plan_apply(
    state: State<AppState>,
    plan_id: String,
    backup_path: Option<String>,
) -> Result<MigrationPlan, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    let index = project
        .migration_history
        .iter()
        .position(|plan| plan.id == plan_id)
        .ok_or("Migration plan not found")?;
    let mut plan = project.migration_history[index].clone();

    let fallback_project_path = state.project_path.lock().map_err(|_| "lock")?.clone();
    let requested_backup_path = backup_path
        .as_ref()
        .and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(PathBuf::from(trimmed))
            }
        })
        .unwrap_or_else(|| migration_backup_path_for(fallback_project_path.as_ref(), &plan.id));
    let backup = validate_path_safe(&requested_backup_path)?;
    if let Some(parent) = backup.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to prepare backup folder: {e}"))?;
    }
    project_io::save_project(&project, &backup)?;
    plan.backup_path = Some(backup.to_string_lossy().to_string());

    for step in &mut plan.steps {
        step.applied = true;
        step.error = None;
    }
    project.version = plan
        .target_version
        .min(crate::models::PROJECT_SCHEMA_VERSION);
    plan.applied = true;
    project.migration_history[index] = plan.clone();
    refresh_system_health(&mut project, now);
    Ok(plan)
}

#[tauri::command]
pub fn project_missing_media_scan(
    state: State<AppState>,
) -> Result<Vec<MissingMediaAsset>, String> {
    let project = state.project.lock().map_err(|_| "lock")?;
    let missing = project
        .media
        .iter()
        .filter(|asset| !std::path::Path::new(asset.path.as_str()).exists())
        .map(|asset| MissingMediaAsset {
            asset_id: asset.id.clone(),
            name: asset.name.clone(),
            path: asset.path.clone(),
            filename: std::path::Path::new(asset.path.as_str())
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or(asset.name.as_str())
                .to_string(),
        })
        .collect::<Vec<_>>();
    Ok(missing)
}

#[tauri::command]
pub fn project_missing_media_relink(
    state: State<AppState>,
    search_roots: Vec<String>,
    dry_run: Option<bool>,
) -> Result<Vec<MediaRelinkResult>, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let dry_run = dry_run.unwrap_or(true);

    let roots = search_roots
        .into_iter()
        .map(PathBuf::from)
        .filter(|path| path.exists() && path.is_dir())
        .collect::<Vec<_>>();
    if roots.is_empty() {
        return Err("No valid search roots provided".to_string());
    }

    let filename_index = build_media_index(&roots, 200_000);
    let mut results = Vec::new();
    for asset in &mut project.media {
        let old_path = asset.path.clone();
        if std::path::Path::new(old_path.as_str()).exists() {
            continue;
        }

        let filename = std::path::Path::new(old_path.as_str())
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(asset.name.as_str())
            .to_ascii_lowercase();
        let candidates = filename_index.get(&filename).cloned().unwrap_or_default();
        let new_path = candidates
            .iter()
            .min_by_key(|candidate| candidate.to_string_lossy().len())
            .map(|candidate| candidate.to_string_lossy().to_string());
        let relinked = new_path.is_some();
        if relinked && !dry_run {
            if let Some(path) = new_path.as_ref() {
                asset.path = path.clone();
            }
        }
        results.push(MediaRelinkResult {
            asset_id: asset.id.clone(),
            old_path,
            new_path,
            candidate_count: candidates.len() as u32,
            relinked,
        });
    }

    let now = now_unix_ms();
    if !dry_run {
        let relinked_count = results.iter().filter(|result| result.relinked).count();
        show_control::push_dashboard_event(
            &mut project.show_project.dashboard,
            "media_relink",
            "apply",
            format!("Relinked {relinked_count} missing assets").as_str(),
            now,
        );
    }
    refresh_system_health(&mut project, now);
    Ok(results)
}

#[tauri::command]
pub fn plugin_chain_preflight(state: State<AppState>) -> Result<Vec<PluginChainIssue>, String> {
    let project = state.project.lock().map_err(|_| "lock")?;
    let mut issues = Vec::new();
    for track in &project.tracks {
        for instance in &track.plugin_chain.instances {
            let descriptor = project
                .plugin_registry
                .iter()
                .find(|entry| entry.id == instance.descriptor_id);
            let Some(descriptor) = descriptor else {
                issues.push(PluginChainIssue {
                    track_id: track.id.clone(),
                    track_name: track.name.clone(),
                    instance_id: instance.id.clone(),
                    descriptor_id: instance.descriptor_id.clone(),
                    severity: "error".to_string(),
                    message: "Plugin descriptor missing from registry.".to_string(),
                });
                continue;
            };

            if descriptor.format.eq_ignore_ascii_case("vst3") {
                if !std::path::Path::new(descriptor.binary_path.as_str()).exists() {
                    issues.push(PluginChainIssue {
                        track_id: track.id.clone(),
                        track_name: track.name.clone(),
                        instance_id: instance.id.clone(),
                        descriptor_id: descriptor.id.clone(),
                        severity: "error".to_string(),
                        message: format!("Plugin binary not found: {}", descriptor.binary_path),
                    });
                }
                if !descriptor.factory_symbol_found {
                    issues.push(PluginChainIssue {
                        track_id: track.id.clone(),
                        track_name: track.name.clone(),
                        instance_id: instance.id.clone(),
                        descriptor_id: descriptor.id.clone(),
                        severity: "warn".to_string(),
                        message: "GetPluginFactory symbol not found in binary scan.".to_string(),
                    });
                }
            }
        }
    }
    Ok(issues)
}

#[tauri::command]
pub fn error_report_add(
    state: State<AppState>,
    source: String,
    message: String,
    severity: Option<String>,
    context: Option<String>,
) -> Result<ErrorReport, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    let report = ErrorReport {
        id: Uuid::new_v4().to_string(),
        source: source.clone(),
        message,
        severity: severity.unwrap_or_else(|| "error".to_string()),
        created_unix_ms: now,
        context,
        recovery_actions: default_recovery_actions(source.as_str()),
        acknowledged: false,
        dispatched_unix_ms: None,
        dispatch_attempts: 0,
    };
    project.error_reports.push(report.clone());
    if project.error_reports.len() > 256 {
        let len = project.error_reports.len();
        project.error_reports.drain(0..len - 256);
    }
    refresh_system_health(&mut project, now);
    Ok(report)
}

#[tauri::command]
pub fn error_report_ack(
    state: State<AppState>,
    report_id: String,
    acknowledged: bool,
) -> Result<ErrorReport, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    let report = project
        .error_reports
        .iter_mut()
        .find(|entry| entry.id == report_id)
        .ok_or("Error report not found")?;
    report.acknowledged = acknowledged;
    let out = report.clone();
    refresh_system_health(&mut project, now);
    Ok(out)
}

#[tauri::command]
pub fn error_report_list(state: State<AppState>) -> Result<Vec<ErrorReport>, String> {
    let project = state.project.lock().map_err(|_| "lock")?;
    Ok(project.error_reports.clone())
}

#[tauri::command]
pub fn error_report_dispatch(
    state: State<AppState>,
    report_id: Option<String>,
) -> Result<Vec<ErrorReport>, String> {
    let (endpoint, project_snapshot, reports) = {
        let project = state.project.lock().map_err(|_| "lock")?;
        if !project.release_config.crash_reporting_enabled {
            return Err("Crash reporting is disabled in release configuration".to_string());
        }
        let endpoint = project
            .release_config
            .crash_report_endpoint
            .clone()
            .filter(|value| !value.trim().is_empty())
            .ok_or("Crash report endpoint is not configured")?;
        let reports = project
            .error_reports
            .iter()
            .filter(|report| {
                report_id
                    .as_ref()
                    .map(|only_id| report.id == *only_id)
                    .unwrap_or(true)
            })
            .cloned()
            .collect::<Vec<_>>();
        (endpoint, project.clone(), reports)
    };

    let now = now_unix_ms();
    let mut results = Vec::new();
    for snapshot in reports {
        let result =
            dispatch_error_report_to_endpoint(endpoint.as_str(), &snapshot, &project_snapshot);
        results.push((snapshot.id, result));
    }

    let mut project = state.project.lock().map_err(|_| "lock")?;
    let mut dispatched = Vec::new();
    for (report_id, result) in results {
        let Some(index) = project
            .error_reports
            .iter()
            .position(|report| report.id == report_id)
        else {
            continue;
        };
        project.error_reports[index].dispatch_attempts = project.error_reports[index]
            .dispatch_attempts
            .saturating_add(1);
        match result {
            Ok(()) => {
                project.error_reports[index].dispatched_unix_ms = Some(now);
                dispatched.push(project.error_reports[index].clone());
            }
            Err(e) => {
                if project.error_reports[index].context.is_none() {
                    project.error_reports[index].context = Some(e);
                }
            }
        }
    }

    if dispatched.is_empty() {
        if report_id.is_some() {
            return Err("No matching error report was dispatched".to_string());
        }
        return Err("No dispatches succeeded".to_string());
    }
    refresh_system_health(&mut project, now);
    Ok(dispatched)
}

#[tauri::command]
pub fn release_readiness_check(state: State<AppState>) -> Result<ReleaseReadinessCheck, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    let check = evaluate_release_readiness(&project, now);
    show_control::push_dashboard_event(
        &mut project.show_project.dashboard,
        "release_ops",
        "readiness_check",
        if check.ready { "ready" } else { "blocked" },
        now,
    );
    refresh_system_health(&mut project, now);
    Ok(check)
}

#[tauri::command]
pub fn support_bundle_export(
    state: State<AppState>,
    path: String,
    include_project_state: bool,
    include_device_state: bool,
    include_logs: bool,
) -> Result<SupportBundle, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    let output_path = validate_path_safe(&PathBuf::from(&path))?;
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create support directory: {e}"))?;
    }

    let bundle_id = Uuid::new_v4().to_string();
    let app_version = project.version;
    let app_title = project.title.clone();
    let health = project.system_health.clone();
    let errors = project.error_reports.clone();
    let compatibility_reports = project.compatibility_reports.clone();
    let migration_history = project.migration_history.clone();
    let diagnostics = project.device_diagnostics.clone();
    let device_profiles = project.device_profiles.clone();
    let log_events = project.show_project.dashboard.recent_events.clone();
    let project_state = if include_project_state {
        Some(project.clone())
    } else {
        None
    };
    let payload = serde_json::json!({
        "bundle_id": bundle_id.clone(),
        "created_unix_ms": now,
        "app": {
            "schema_version": crate::models::PROJECT_SCHEMA_VERSION,
            "project_version": app_version,
            "title": app_title,
        },
        "health": health,
        "errors": errors,
        "compatibility_reports": compatibility_reports,
        "migration_history": migration_history,
        "device_diagnostics": if include_device_state { serde_json::json!(diagnostics) } else { serde_json::Value::Null },
        "device_profiles": if include_device_state { serde_json::json!(device_profiles) } else { serde_json::Value::Null },
        "project_state": if let Some(state_payload) = project_state { serde_json::json!(state_payload) } else { serde_json::Value::Null },
        "logs": if include_logs {
            serde_json::json!(log_events)
        } else {
            serde_json::Value::Null
        }
    });
    let encoded = serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?;
    fs::write(&output_path, encoded).map_err(|e| format!("Failed to write support bundle: {e}"))?;

    let bundle = SupportBundle {
        id: bundle_id,
        path: output_path.to_string_lossy().to_string(),
        created_unix_ms: now,
        include_logs,
        include_project_state,
        include_device_state,
        status: "completed".to_string(),
    };
    project.support_bundles.push(bundle.clone());
    if project.support_bundles.len() > 64 {
        let len = project.support_bundles.len();
        project.support_bundles.drain(0..len - 64);
    }
    refresh_system_health(&mut project, now);
    Ok(bundle)
}

#[tauri::command]
pub fn performance_profile_capture(state: State<AppState>) -> Result<PerformanceProfile, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    let clip_count = project
        .tracks
        .iter()
        .map(|track| track.clips.len() + track.midi_clips.len())
        .sum::<usize>() as u32;
    project.performance_profile = PerformanceProfile {
        captured_unix_ms: Some(now),
        startup_ms: (project.tracks.len() as f64 * 1.2 + project.media.len() as f64 * 0.8).max(5.0),
        ui_frame_budget_ms: if project.preferences.reduce_motion {
            20.0
        } else {
            16.6
        },
        audio_buffer_ms: project.monitoring.target_buffer_ms,
        project_track_count: project.tracks.len() as u32,
        project_clip_count: clip_count,
        show_event_queue_depth: project.show_project.dashboard.recent_events.len() as u32,
        recommendation: if project.monitoring.target_buffer_ms > 256 {
            "Lower monitoring buffer and freeze heavy tracks for tighter latency.".to_string()
        } else if clip_count > 600 {
            "Use render-in-place or freeze on dense tracks to improve UI responsiveness."
                .to_string()
        } else {
            "Current session profile is stable for RC validation.".to_string()
        },
    };
    refresh_system_health(&mut project, now);
    Ok(project.performance_profile.clone())
}

#[tauri::command]
pub fn release_config_update(
    state: State<AppState>,
    mut release_config: ReleaseConfig,
) -> Result<ReleaseConfig, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    release_config.channel = if release_config.channel.trim().is_empty() {
        "rc".to_string()
    } else {
        release_config.channel
    };
    release_config.diagnostics_retention_days =
        release_config.diagnostics_retention_days.clamp(3, 90);
    if release_config.target_platforms.is_empty() {
        release_config.target_platforms = vec!["linux".to_string()];
    }
    project.release_config = release_config.clone();
    refresh_system_health(&mut project, now_unix_ms());
    Ok(release_config)
}

#[tauri::command]
pub fn onboarding_state_update(
    state: State<AppState>,
    mut onboarding: OnboardingState,
) -> Result<OnboardingState, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    onboarding.current_step_index = onboarding
        .current_step_index
        .min(onboarding.steps.len().saturating_sub(1) as u32);
    onboarding.completed = onboarding.steps.iter().all(|step| step.completed);
    onboarding.last_opened_unix_ms = Some(now);
    project.onboarding = onboarding.clone();
    refresh_system_health(&mut project, now);
    Ok(onboarding)
}

#[tauri::command]
pub fn system_health_snapshot(state: State<AppState>) -> Result<SystemHealthSnapshot, String> {
    let mut project = state.project.lock().map_err(|_| "lock")?;
    let now = now_unix_ms();
    refresh_system_health(&mut project, now);
    Ok(project.system_health.clone())
}

// ---------------------------------------------------------------------------
// Unused import silencer
// ---------------------------------------------------------------------------
const _: u32 = TICKS_PER_BEAT;
const _: Option<ChordSuggestion> = None;
const _: Option<ProgressionSuggestion> = None;
const _: Option<SetlistEntry> = None;
