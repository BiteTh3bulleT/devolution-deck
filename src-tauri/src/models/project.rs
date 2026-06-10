//! Project, track, clip, and media asset models.

use crate::models::midi::{MidiClip, MidiNote};
use serde::{Deserialize, Serialize};

/// Project file schema version. Bump when persistence format changes.
pub const PROJECT_SCHEMA_VERSION: u32 = 8;

fn default_track_volume_db() -> f64 {
    0.0
}

fn default_autosave_interval_secs() -> u32 {
    60
}

/// Discriminates audio tracks from MIDI tracks.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrackType {
    Audio,
    Midi,
}

impl Default for TrackType {
    fn default() -> Self {
        TrackType::Audio
    }
}

/// Optional instrument assigned to a track (for future plugin hosting).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstrumentAssignment {
    pub id: String,
    pub name: String,
    /// "builtin_synth" | "builtin_drums" | "vst"
    pub plugin_type: String,
    pub preset: Option<String>,
}

/// Loop region on the timeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoopRegion {
    pub start_secs: f64,
    pub end_secs: f64,
    pub enabled: bool,
}

/// Audio clip warp/time-stretch controls.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WarpState {
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_bpm: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_bpm: Option<f64>,
    pub algorithm: String,
    pub preserve_formants: bool,
}

impl Default for WarpState {
    fn default() -> Self {
        Self {
            enabled: false,
            source_bpm: None,
            target_bpm: None,
            algorithm: "elastique_pro".to_string(),
            preserve_formants: true,
        }
    }
}

/// Slice marker for sample chopping workflows.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SliceMarker {
    pub id: String,
    pub time_secs: f64,
    pub transient_strength: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// Scene row in the session launcher.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Scene {
    pub id: String,
    pub name: String,
    pub color: String,
    pub index: u32,
    pub launch_quantize_beats: u32,
}

/// Session launcher clip source.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SessionClipSource {
    Audio {
        media_asset_id: String,
        source_offset_secs: f64,
    },
    Midi {
        notes: Vec<MidiNote>,
    },
}

/// Session launcher clip cell payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionClip {
    pub id: String,
    pub track_id: String,
    pub scene_id: String,
    pub name: String,
    pub source: SessionClipSource,
    pub length_secs: f64,
    pub gain_db: f64,
    pub muted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warp: Option<WarpState>,
    #[serde(default)]
    pub slices: Vec<SliceMarker>,
}

/// Session launcher state persisted in project.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SessionState {
    #[serde(default)]
    pub scenes: Vec<Scene>,
    #[serde(default)]
    pub clips: Vec<SessionClip>,
    #[serde(default = "SessionState::default_quantize_beats")]
    pub launch_quantize_beats: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_scene_id: Option<String>,
}

impl SessionState {
    fn default_quantize_beats() -> u32 {
        4
    }
}

/// Automation point on a lane.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationPoint {
    pub id: String,
    pub time_secs: f64,
    pub value: f64,
    /// Curve amount -1..1 where 0 = linear.
    pub curve: f64,
}

/// Automation lane attached to track+parameter.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationLane {
    pub id: String,
    pub track_id: String,
    pub parameter: String,
    pub enabled: bool,
    #[serde(default)]
    pub points: Vec<AutomationPoint>,
}

/// Send route from track to a return track.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendRoute {
    pub id: String,
    pub from_track_id: String,
    pub to_return_id: String,
    pub amount: f64,
    pub pre_fader: bool,
    pub enabled: bool,
}

/// Return track foundation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReturnTrack {
    pub id: String,
    pub name: String,
    pub index: u32,
    pub gain_db: f64,
    pub muted: bool,
}

/// Group/bus track foundation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BusTrack {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub member_track_ids: Vec<String>,
    pub gain_db: f64,
    pub muted: bool,
    pub solo: bool,
}

/// Mixer/routing domain persisted as part of project.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RoutingState {
    #[serde(default)]
    pub returns: Vec<ReturnTrack>,
    #[serde(default)]
    pub buses: Vec<BusTrack>,
    #[serde(default)]
    pub sends: Vec<SendRoute>,
}

/// Browser tag taxonomy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserTag {
    pub id: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

/// Index metadata for one media asset in browser.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserAssetIndexEntry {
    pub asset_id: String,
    #[serde(default)]
    pub tag_ids: Vec<String>,
    pub favorite: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_used_unix_ms: Option<i64>,
}

/// Browser index/search state.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BrowserIndexState {
    #[serde(default)]
    pub tags: Vec<BrowserTag>,
    #[serde(default)]
    pub assets: Vec<BrowserAssetIndexEntry>,
    #[serde(default)]
    pub selected_tag_ids: Vec<String>,
    #[serde(default)]
    pub search_query: String,
}

/// Template track blueprint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateTrack {
    pub name: String,
    pub role: String,
    #[serde(default)]
    pub track_type: TrackType,
}

/// Stored template metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateDefinition {
    pub id: String,
    pub name: String,
    pub genre: String,
    pub description: String,
    pub bpm: f64,
    #[serde(default)]
    pub tracks: Vec<TemplateTrack>,
}

/// AI chord suggestion for composition guidance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChordSuggestion {
    pub id: String,
    pub key_root: String,
    pub scale: String,
    pub chord: String,
    pub roman: String,
    pub start_bar: u32,
    pub duration_bars: u32,
    pub confidence: f64,
    pub tension: f64,
}

/// AI progression suggestion bundle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressionSuggestion {
    pub id: String,
    pub name: String,
    pub mood: String,
    pub bars: u32,
    #[serde(default)]
    pub chords: Vec<String>,
    pub confidence: f64,
}

/// Harmony helper output payload.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct HarmonySuggestionPack {
    #[serde(default)]
    pub chords: Vec<ChordSuggestion>,
    #[serde(default)]
    pub progressions: Vec<ProgressionSuggestion>,
}

/// Asset classification generated by browser assistant.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetClassification {
    pub asset_id: String,
    pub category: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sub_category: Option<String>,
    pub confidence: f64,
    pub is_loop: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_bpm: Option<f64>,
    pub energy: f64,
    #[serde(default)]
    pub suggested_tags: Vec<String>,
    pub reasoning: String,
}

/// Producer insight shown in dashboard.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProducerInsight {
    pub id: String,
    pub title: String,
    pub description: String,
    pub severity: String,
    pub action_id: String,
    pub value: f64,
}

/// Assistant plugin step inside preset.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssistantPluginStep {
    pub descriptor_id: String,
    #[serde(default)]
    pub parameters: Vec<PluginParameterState>,
    pub optional: bool,
}

/// Assistant preset definition for track setup workflows.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssistantPreset {
    pub id: String,
    pub name: String,
    pub category: String,
    pub description: String,
    #[serde(default)]
    pub steps: Vec<AssistantPluginStep>,
}

/// Dashboard widget visibility and dismissed states.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardWidgetState {
    pub show_ai_assistant: bool,
    pub show_performance: bool,
    pub show_insights: bool,
    #[serde(default)]
    pub collapsed_widget_ids: Vec<String>,
    #[serde(default)]
    pub dismissed_insight_ids: Vec<String>,
    pub last_refresh_unix_ms: i64,
}

impl Default for DashboardWidgetState {
    fn default() -> Self {
        Self {
            show_ai_assistant: true,
            show_performance: true,
            show_insights: true,
            collapsed_widget_ids: vec![],
            dismissed_insight_ids: vec![],
            last_refresh_unix_ms: 0,
        }
    }
}

/// Performance-mode state for stage workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceModeState {
    pub enabled: bool,
    pub safety_lock: bool,
    pub launch_quantize_beats: u32,
    pub cue_preview_enabled: bool,
    pub crossfader: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_macro_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_scene_id: Option<String>,
}

impl Default for PerformanceModeState {
    fn default() -> Self {
        Self {
            enabled: false,
            safety_lock: true,
            launch_quantize_beats: 4,
            cue_preview_enabled: true,
            crossfader: 0.0,
            active_macro_id: None,
            selected_scene_id: None,
        }
    }
}

/// Macro mute-state mutation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MacroTrackMute {
    pub track_id: String,
    pub muted: bool,
}

/// Macro send override mutation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MacroSendOverride {
    pub send_id: String,
    pub amount: f64,
    pub enabled: bool,
}

/// Performance macro definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceMacro {
    pub id: String,
    pub name: String,
    pub description: String,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub launch_scene_id: Option<String>,
    #[serde(default)]
    pub track_mutes: Vec<MacroTrackMute>,
    #[serde(default)]
    pub send_overrides: Vec<MacroSendOverride>,
    #[serde(default)]
    pub trigger_cue_ids: Vec<String>,
    pub color: String,
}

/// Scene trigger mapping for hardware/software trigger sources.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneTrigger {
    pub id: String,
    pub scene_id: String,
    pub key_binding: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub macro_id: Option<String>,
    pub launch_quantize_beats: u32,
    pub enabled: bool,
}

/// Show cue abstraction for MIDI/OSC/DMX bridge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShowCue {
    pub id: String,
    pub name: String,
    pub protocol: String,
    pub address: String,
    pub value: f64,
    pub duration_ms: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_hex: Option<String>,
    pub enabled: bool,
}

/// Link performance macro triggers to show cues.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LightingCueBinding {
    pub id: String,
    pub macro_id: String,
    pub show_cue_id: String,
    pub on_scene_launch: bool,
    pub enabled: bool,
}

/// Visual timing bridge preferences for external visuals/lighting.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisualSyncState {
    pub enabled: bool,
    pub bpm_multiplier: f64,
    pub fps_limit: u32,
    pub strobe_on_scene_launch: bool,
    pub latency_ms: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_event_unix_ms: Option<i64>,
}

impl Default for VisualSyncState {
    fn default() -> Self {
        Self {
            enabled: false,
            bpm_multiplier: 1.0,
            fps_limit: 60,
            strobe_on_scene_launch: false,
            latency_ms: 0.0,
            last_event_unix_ms: None,
        }
    }
}

/// Theme tokens used for branded appearance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeTokenSet {
    pub bg_hex: String,
    pub surface_hex: String,
    pub panel_hex: String,
    pub border_hex: String,
    pub text_hex: String,
    pub text_muted_hex: String,
    pub accent_hex: String,
    pub cyan_hex: String,
    pub magenta_hex: String,
    pub amber_hex: String,
}

impl Default for ThemeTokenSet {
    fn default() -> Self {
        Self {
            bg_hex: "#07090f".to_string(),
            surface_hex: "#101522".to_string(),
            panel_hex: "#131a2a".to_string(),
            border_hex: "#1f2a40".to_string(),
            text_hex: "#e8edf8".to_string(),
            text_muted_hex: "#95a3bf".to_string(),
            accent_hex: "#ff6b1a".to_string(),
            cyan_hex: "#38d7ff".to_string(),
            magenta_hex: "#ff4fd8".to_string(),
            amber_hex: "#ffc247".to_string(),
        }
    }
}

/// Branding config for DevolutionDeck identity.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrandingConfig {
    pub brand_name: String,
    pub artist_name: String,
    pub logo_text: String,
    pub motto: String,
    #[serde(default)]
    pub theme: ThemeTokenSet,
    #[serde(default)]
    pub performance_palette: Vec<String>,
    pub enable_glow: bool,
}

impl Default for BrandingConfig {
    fn default() -> Self {
        Self {
            brand_name: "DEVOLUTION//DECK".to_string(),
            artist_name: "DJ Devooo".to_string(),
            logo_text: "DΞVOLUTION".to_string(),
            motto: "Artist Operating System".to_string(),
            theme: ThemeTokenSet::default(),
            performance_palette: vec![
                "#ff6b1a".to_string(),
                "#38d7ff".to_string(),
                "#ff4fd8".to_string(),
                "#ffc247".to_string(),
            ],
            enable_glow: true,
        }
    }
}

/// Beat grid metadata for DJ deck sync.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BeatGrid {
    pub bpm: f64,
    pub offset_secs: f64,
    pub confidence: f64,
}

/// Phrase marker in analyzed song structure.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhraseMarker {
    pub id: String,
    pub start_secs: f64,
    pub length_bars: u32,
    pub energy: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// Musical key metadata for DJ harmonic mixing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyAnalysis {
    pub key: String,
    pub scale: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub camelot: Option<String>,
    pub confidence: f64,
    pub source: String,
}

/// Cue point saved for deck/library workflows.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CuePoint {
    pub id: String,
    pub label: String,
    pub position_secs: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_hex: Option<String>,
}

/// Deck loop state with quantization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoopState {
    pub enabled: bool,
    pub start_secs: f64,
    pub end_secs: f64,
    pub quantize_beats: u32,
}

/// Library item representing one DJ-playable track.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryItem {
    pub id: String,
    pub media_asset_id: String,
    pub title: String,
    pub artist: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bpm: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub beat_grid: Option<BeatGrid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_analysis: Option<KeyAnalysis>,
    #[serde(default)]
    pub phrase_markers: Vec<PhraseMarker>,
    #[serde(default)]
    pub cue_points: Vec<CuePoint>,
    #[serde(default)]
    pub saved_loops: Vec<LoopState>,
    pub rating: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    pub added_unix_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_played_unix_ms: Option<i64>,
    #[serde(default)]
    pub play_count: u32,
}

/// User-managed crate for fast retrieval in live sets.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Crate {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_hex: Option<String>,
    #[serde(default)]
    pub item_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub smart_query: Option<String>,
    pub created_unix_ms: i64,
}

/// Deck track reference to a library/media item.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeckTrackReference {
    pub library_item_id: String,
    pub media_asset_id: String,
}

/// One DJ deck runtime state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeckState {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loaded_track: Option<DeckTrackReference>,
    pub playing: bool,
    pub position_secs: f64,
    pub tempo_bpm: f64,
    pub tempo_multiplier: f64,
    pub pitch_lock: bool,
    pub gain_db: f64,
    pub filter: f64,
    #[serde(default)]
    pub hot_cues: Vec<CuePoint>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loop_state: Option<LoopState>,
    pub beat_phase: f64,
    pub quantize_beats: u32,
    pub vinyl_mode: bool,
    pub jog_sensitivity: f64,
}

impl DeckState {
    pub fn new(id: &str, tempo_bpm: f64) -> Self {
        Self {
            id: id.to_string(),
            loaded_track: None,
            playing: false,
            position_secs: 0.0,
            tempo_bpm,
            tempo_multiplier: 1.0,
            pitch_lock: true,
            gain_db: 0.0,
            filter: 0.0,
            hot_cues: vec![],
            loop_state: None,
            beat_phase: 0.0,
            quantize_beats: 4,
            vinyl_mode: false,
            jog_sensitivity: 1.0,
        }
    }
}

/// Deck synchronization state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeckSyncState {
    pub enabled: bool,
    pub master_deck_id: String,
    pub sync_quantize_beats: u32,
    pub tempo_tolerance: f64,
    pub phase_lock: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_sync_unix_ms: Option<i64>,
}

impl Default for DeckSyncState {
    fn default() -> Self {
        Self {
            enabled: false,
            master_deck_id: "A".to_string(),
            sync_quantize_beats: 4,
            tempo_tolerance: 0.08,
            phase_lock: true,
            last_sync_unix_ms: None,
        }
    }
}

/// Side assignment for crossfader routing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CrossfaderSide {
    Left,
    Center,
    Right,
}

impl Default for CrossfaderSide {
    fn default() -> Self {
        CrossfaderSide::Center
    }
}

/// Crossfader assignment for one DAW track.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossfaderTrackBinding {
    pub track_id: String,
    #[serde(default)]
    pub side: CrossfaderSide,
}

/// Crossfader bridge state linking deck and DAW mixer concepts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossfaderState {
    pub position: f64,
    pub curve: f64,
    pub deck_a_gain: f64,
    pub deck_b_gain: f64,
    #[serde(default)]
    pub track_bindings: Vec<CrossfaderTrackBinding>,
}

impl Default for CrossfaderState {
    fn default() -> Self {
        Self {
            position: 0.0,
            curve: 0.5,
            deck_a_gain: 1.0,
            deck_b_gain: 1.0,
            track_bindings: vec![],
        }
    }
}

/// Sampler slot for live remix triggering.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SamplerSlot {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub library_item_id: Option<String>,
    pub gain_db: f64,
    pub one_shot: bool,
}

/// Performance pad mapping for scene/macro/sample/show actions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformancePad {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sampler_slot_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scene_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub macro_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_trigger_id: Option<String>,
    pub quantize_beats: u32,
    pub color: String,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_trigger_unix_ms: Option<i64>,
}

/// One entry in a setlist.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetlistEntry {
    pub id: String,
    pub library_item_id: String,
    pub target_deck_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transition_hint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_bpm: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prepared_cue_id: Option<String>,
    pub played: bool,
}

/// Performance setlist for show preparation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Setlist {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub venue: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(default)]
    pub entries: Vec<SetlistEntry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_entry_id: Option<String>,
}

/// OSC binding payload definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OscBinding {
    pub address: String,
    pub host: String,
    pub port: u16,
    pub argument_type: String,
}

/// MIDI binding payload definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiBinding {
    pub channel: u8,
    pub status: String,
    pub data1: u8,
    pub data2: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_name: Option<String>,
}

/// Executable show trigger for deck/session events.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShowTrigger {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub value: f64,
    pub quantize_beats: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub osc_binding: Option<OscBinding>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub midi_binding: Option<MidiBinding>,
}

/// Binding between deck events and show triggers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeckEventBinding {
    pub id: String,
    pub event: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deck_id: Option<String>,
    pub show_trigger_id: String,
    pub enabled: bool,
}

/// Link between session scenes and deck workflow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeckSceneLink {
    pub id: String,
    pub scene_id: String,
    pub preferred_deck_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub library_item_id: Option<String>,
    pub auto_load: bool,
}

/// One DMX channel value assignment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LightingChannelValue {
    pub channel: u16,
    pub value: u8,
}

/// Lighting cue with universe/channel output data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LightingCue {
    pub id: String,
    pub name: String,
    pub universe: u16,
    #[serde(default)]
    pub values: Vec<LightingChannelValue>,
    pub fade_ms: u32,
    pub hold_ms: u32,
    #[serde(default)]
    pub tags: Vec<String>,
    pub enabled: bool,
}

/// Sequenced show-cue step at beat offset.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CueSequenceStep {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lighting_cue_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub show_trigger_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visual_cue_id: Option<String>,
    pub offset_beats: f64,
    pub duration_beats: f64,
    pub enabled: bool,
}

/// Ordered cue-sequence workflow for show timeline execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CueSequence {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub steps: Vec<CueSequenceStep>,
    pub loop_enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linked_scene_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linked_library_item_id: Option<String>,
    pub enabled: bool,
}

/// Trigger mapping for scene/deck/drop/build transitions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CueTrigger {
    pub id: String,
    pub name: String,
    pub trigger_source: String,
    pub trigger_event: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deck_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scene_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub library_item_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cue_sequence_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lighting_cue_id: Option<String>,
    pub quantize_beats: u32,
    pub enabled: bool,
}

/// Visual-cue payload for VJ/visual engines.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisualCue {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub address: String,
    pub payload: String,
    pub enabled: bool,
}

/// Runtime sync event emitted by show engine execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncEvent {
    pub id: String,
    pub source: String,
    pub event: String,
    pub payload: String,
    pub unix_ms: i64,
}

/// DMX universe runtime state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DmxUniverseState {
    pub universe: u16,
    #[serde(default)]
    pub channels: Vec<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_update_unix_ms: Option<i64>,
    pub blackout: bool,
}

impl DmxUniverseState {
    pub fn new(universe: u16) -> Self {
        Self {
            universe,
            channels: vec![0; 512],
            last_update_unix_ms: None,
            blackout: false,
        }
    }
}

/// DMX bridge output preferences.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DmxBridgeConfig {
    pub enabled: bool,
    pub protocol: String,
    pub host: String,
    pub port: u16,
    pub fps_limit: u32,
}

impl Default for DmxBridgeConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            protocol: "artnet".to_string(),
            host: "127.0.0.1".to_string(),
            port: 6454,
            fps_limit: 44,
        }
    }
}

/// Device-driven DMX binding.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DmxBinding {
    pub universe: u16,
    pub channel: u16,
    pub value: u8,
}

/// Generic hardware/software device binding.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceBinding {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub midi_binding: Option<MidiBinding>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub osc_binding: Option<OscBinding>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dmx_binding: Option<DmxBinding>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_trigger_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_sequence_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

/// Blackout state and transition controls.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlackoutState {
    pub enabled: bool,
    pub fade_ms: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_update_unix_ms: Option<i64>,
}

impl Default for BlackoutState {
    fn default() -> Self {
        Self {
            enabled: false,
            fade_ms: 120,
            last_update_unix_ms: None,
        }
    }
}

/// Panic action configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PanicAction {
    pub stop_transport: bool,
    pub stop_decks: bool,
    pub blackout: bool,
    pub reset_sequences: bool,
    pub apply_fallback: bool,
}

impl Default for PanicAction {
    fn default() -> Self {
        Self {
            stop_transport: true,
            stop_decks: true,
            blackout: true,
            reset_sequences: true,
            apply_fallback: false,
        }
    }
}

/// Fallback profile for rapid recovery.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FallbackProfile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub dmx_universes: Vec<DmxUniverseState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scene_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

/// Stage safety state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SafetyState {
    pub panic_active: bool,
    pub guard_enabled: bool,
    #[serde(default)]
    pub blackout: BlackoutState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_action: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    pub fail_count: u32,
}

impl Default for SafetyState {
    fn default() -> Self {
        Self {
            panic_active: false,
            guard_enabled: true,
            blackout: BlackoutState::default(),
            last_action: None,
            last_error: None,
            fail_count: 0,
        }
    }
}

/// Live performance dashboard state for stage operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceDashboardState {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_sequence_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub queued_trigger_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_scene_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deck_a_item_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deck_b_item_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_sync_unix_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_banner: Option<String>,
    #[serde(default)]
    pub recent_events: Vec<SyncEvent>,
    pub dropped_events: u32,
    pub last_sequence_beat: f64,
}

impl Default for PerformanceDashboardState {
    fn default() -> Self {
        Self {
            active_sequence_id: None,
            queued_trigger_id: None,
            active_scene_id: None,
            deck_a_item_id: None,
            deck_b_item_id: None,
            last_sync_unix_ms: None,
            status_banner: None,
            recent_events: vec![],
            dropped_events: 0,
            last_sequence_beat: 0.0,
        }
    }
}

/// Song/scene linked cue mapping.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongCueMap {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub library_item_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scene_id: Option<String>,
    pub transition_event: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cue_sequence_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lighting_cue_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visual_cue_id: Option<String>,
    pub enabled: bool,
}

/// Persisted show project for stage execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShowProject {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub dmx_bridge: DmxBridgeConfig,
    #[serde(default)]
    pub lighting_cues: Vec<LightingCue>,
    #[serde(default)]
    pub cue_sequences: Vec<CueSequence>,
    #[serde(default)]
    pub cue_triggers: Vec<CueTrigger>,
    #[serde(default)]
    pub song_cue_maps: Vec<SongCueMap>,
    #[serde(default)]
    pub device_bindings: Vec<DeviceBinding>,
    #[serde(default)]
    pub visual_cues: Vec<VisualCue>,
    #[serde(default)]
    pub dmx_universes: Vec<DmxUniverseState>,
    #[serde(default)]
    pub fallback_profiles: Vec<FallbackProfile>,
    #[serde(default)]
    pub safety_state: SafetyState,
    #[serde(default)]
    pub dashboard: PerformanceDashboardState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_sequence_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_show_file_path: Option<String>,
}

impl Default for ShowProject {
    fn default() -> Self {
        Self {
            id: "show-main".to_string(),
            name: "Main Show".to_string(),
            dmx_bridge: DmxBridgeConfig::default(),
            lighting_cues: vec![],
            cue_sequences: vec![],
            cue_triggers: vec![],
            song_cue_maps: vec![],
            device_bindings: vec![],
            visual_cues: vec![],
            dmx_universes: vec![DmxUniverseState::new(0)],
            fallback_profiles: vec![],
            safety_state: SafetyState::default(),
            dashboard: PerformanceDashboardState::default(),
            active_sequence_id: None,
            active_show_file_path: None,
        }
    }
}

/// Serialized VST3 plugin descriptor discovered during scan.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginDescriptor {
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub version: String,
    pub format: String,
    pub bundle_path: String,
    pub binary_path: String,
    pub factory_symbol_found: bool,
}

/// One parameter value persisted for a plugin instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginParameterState {
    pub id: String,
    pub value: f64,
}

/// Track plugin instance in the chain.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginInstance {
    pub id: String,
    pub descriptor_id: String,
    pub enabled: bool,
    pub bypassed: bool,
    pub order: u32,
    #[serde(default)]
    pub parameters: Vec<PluginParameterState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub serialized_state_b64: Option<String>,
}

/// Ordered chain of plugins on a track.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PluginChain {
    #[serde(default)]
    pub instances: Vec<PluginInstance>,
}

/// Sidechain routing entry from source track to target track/plugin.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidechainRoute {
    pub id: String,
    pub from_track_id: String,
    pub to_track_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_plugin_instance_id: Option<String>,
    pub amount: f64,
    pub enabled: bool,
}

/// Freeze/render state for a track.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FreezeState {
    pub is_frozen: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frozen_asset_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frozen_path: Option<String>,
    #[serde(default)]
    pub original_clips: Vec<TimelineClip>,
    #[serde(default)]
    pub original_midi_clips: Vec<MidiClip>,
}

/// One rendered job metadata item.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderJob {
    pub id: String,
    pub kind: String,
    pub status: String,
    pub output_dir: String,
    #[serde(default)]
    pub output_files: Vec<String>,
    pub created_unix_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_unix_ms: Option<i64>,
}

/// One clip inside a take lane.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TakeClip {
    pub id: String,
    pub media_asset_id: String,
    pub start_secs: f64,
    pub source_offset_secs: f64,
    pub duration_secs: f64,
}

/// Recording take lane foundation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TakeLane {
    pub id: String,
    pub name: String,
    pub muted: bool,
    #[serde(default)]
    pub clips: Vec<TakeClip>,
}

/// Comp selection from a take lane.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompRegion {
    pub id: String,
    pub lane_id: String,
    pub take_clip_id: String,
    pub start_secs: f64,
    pub end_secs: f64,
    pub fade_secs: f64,
}

/// Recovery snapshot metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoverySnapshot {
    pub id: String,
    pub path: String,
    pub created_unix_ms: i64,
    pub reason: String,
}

/// Configurable keyboard shortcut binding.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutBinding {
    pub id: String,
    pub action_id: String,
    pub key: String,
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub meta: bool,
    pub enabled: bool,
}

/// Monitoring and latency preferences.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitoringState {
    pub input_monitoring_enabled: bool,
    pub direct_monitoring_preferred: bool,
    pub target_buffer_ms: u32,
    pub latency_compensation_ms: f64,
}

impl Default for MonitoringState {
    fn default() -> Self {
        Self {
            input_monitoring_enabled: false,
            direct_monitoring_preferred: false,
            target_buffer_ms: 64,
            latency_compensation_ms: 0.0,
        }
    }
}

/// High-level application mode used by unified studio/deck/show navigation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppMode {
    Studio,
    Deck,
    Show,
    Hybrid,
}

impl Default for AppMode {
    fn default() -> Self {
        AppMode::Studio
    }
}

/// Persisted navigation state across app modes and panel contexts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NavigationState {
    #[serde(default)]
    pub active_mode: AppMode,
    pub main_view: String,
    pub utility_tab: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub focus_track_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_route_unix_ms: Option<i64>,
}

impl Default for NavigationState {
    fn default() -> Self {
        Self {
            active_mode: AppMode::Studio,
            main_view: "arrangement".to_string(),
            utility_tab: "inspector".to_string(),
            focus_track_id: None,
            last_route_unix_ms: None,
        }
    }
}

/// User preferences consolidated for studio + stage operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPreferences {
    #[serde(default)]
    pub startup_mode: AppMode,
    pub open_last_project_on_launch: bool,
    pub auto_analyze_library: bool,
    pub low_light_boost: bool,
    pub reduce_motion: bool,
    pub show_tooltips: bool,
    pub metronome_default_enabled: bool,
    pub ui_scale: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preferred_audio_input_device: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preferred_audio_output_device: Option<String>,
}

impl Default for UserPreferences {
    fn default() -> Self {
        Self {
            startup_mode: AppMode::Studio,
            open_last_project_on_launch: true,
            auto_analyze_library: true,
            low_light_boost: true,
            reduce_motion: false,
            show_tooltips: true,
            metronome_default_enabled: false,
            ui_scale: 1.0,
            preferred_audio_input_device: None,
            preferred_audio_output_device: None,
        }
    }
}

/// Runtime-detected hardware/software endpoint profile.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceProfile {
    pub id: String,
    pub name: String,
    pub device_type: String,
    pub connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sample_rate: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channels: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_seen_unix_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

/// Device diagnostics status cache.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceDiagnosticState {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_run_unix_ms: Option<i64>,
    #[serde(default)]
    pub audio_input_devices: Vec<String>,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(default)]
    pub errors: Vec<String>,
    pub midi_binding_count: u32,
    pub osc_binding_count: u32,
    pub dmx_universe_count: u32,
    pub healthy: bool,
}

impl Default for DeviceDiagnosticState {
    fn default() -> Self {
        Self {
            last_run_unix_ms: None,
            audio_input_devices: vec![],
            warnings: vec![],
            errors: vec![],
            midi_binding_count: 0,
            osc_binding_count: 0,
            dmx_universe_count: 0,
            healthy: true,
        }
    }
}

/// Compatibility result against current app schema and runtime constraints.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompatibilityReport {
    pub id: String,
    pub created_unix_ms: i64,
    pub schema_version: u32,
    pub compatible: bool,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(default)]
    pub required_migrations: Vec<String>,
    #[serde(default)]
    pub missing_assets: Vec<String>,
}

/// One migration step in a migration plan.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrationStep {
    pub id: String,
    pub description: String,
    pub applied: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Persisted migration plan status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrationPlan {
    pub id: String,
    pub created_unix_ms: i64,
    pub source_version: u32,
    pub target_version: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backup_path: Option<String>,
    #[serde(default)]
    pub steps: Vec<MigrationStep>,
    pub applied: bool,
}

/// Recovery action attached to an error report for actionable UX.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryAction {
    pub id: String,
    pub name: String,
    pub description: String,
    pub command_id: String,
    pub recommended: bool,
}

/// Normalized application error report persisted with context.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorReport {
    pub id: String,
    pub source: String,
    pub message: String,
    pub severity: String,
    pub created_unix_ms: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,
    #[serde(default)]
    pub recovery_actions: Vec<RecoveryAction>,
    pub acknowledged: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dispatched_unix_ms: Option<i64>,
    #[serde(default)]
    pub dispatch_attempts: u32,
}

/// Support export bundle metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupportBundle {
    pub id: String,
    pub path: String,
    pub created_unix_ms: i64,
    pub include_logs: bool,
    pub include_project_state: bool,
    pub include_device_state: bool,
    pub status: String,
}

/// Lightweight performance profile snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceProfile {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub captured_unix_ms: Option<i64>,
    pub startup_ms: f64,
    pub ui_frame_budget_ms: f64,
    pub audio_buffer_ms: u32,
    pub project_track_count: u32,
    pub project_clip_count: u32,
    pub show_event_queue_depth: u32,
    pub recommendation: String,
}

impl Default for PerformanceProfile {
    fn default() -> Self {
        Self {
            captured_unix_ms: None,
            startup_ms: 0.0,
            ui_frame_budget_ms: 16.6,
            audio_buffer_ms: 64,
            project_track_count: 0,
            project_clip_count: 0,
            show_event_queue_depth: 0,
            recommendation: "Capture a profile to generate optimization guidance.".to_string(),
        }
    }
}

/// Packaging and release controls.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReleaseConfig {
    pub channel: String,
    #[serde(default)]
    pub target_platforms: Vec<String>,
    pub code_signing_ready: bool,
    pub crash_reporting_enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub crash_report_endpoint: Option<String>,
    pub diagnostics_retention_days: u32,
    pub build_number: u32,
}

impl Default for ReleaseConfig {
    fn default() -> Self {
        Self {
            channel: "rc".to_string(),
            target_platforms: vec![
                "linux".to_string(),
                "macos".to_string(),
                "windows".to_string(),
            ],
            code_signing_ready: false,
            crash_reporting_enabled: false,
            crash_report_endpoint: None,
            diagnostics_retention_days: 14,
            build_number: 1,
        }
    }
}

/// Release readiness check output for packaging/distribution hardening.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReleaseReadinessCheck {
    pub id: String,
    pub created_unix_ms: i64,
    pub ready: bool,
    #[serde(default)]
    pub blockers: Vec<String>,
    #[serde(default)]
    pub warnings: Vec<String>,
}

/// Dashboard status indicator used for live system health surfaces.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusIndicatorState {
    pub id: String,
    pub label: String,
    pub level: String,
    pub detail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_unix_ms: Option<i64>,
}

/// Onboarding checklist item.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnboardingStep {
    pub id: String,
    pub title: String,
    pub completed: bool,
    pub action_id: String,
}

/// Onboarding and embedded help progression state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnboardingState {
    pub completed: bool,
    pub dismissed: bool,
    pub current_step_index: u32,
    #[serde(default)]
    pub steps: Vec<OnboardingStep>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_opened_unix_ms: Option<i64>,
}

impl Default for OnboardingState {
    fn default() -> Self {
        Self {
            completed: false,
            dismissed: false,
            current_step_index: 0,
            steps: vec![
                OnboardingStep {
                    id: "load_project".to_string(),
                    title: "Load or create a project".to_string(),
                    completed: false,
                    action_id: "project_new".to_string(),
                },
                OnboardingStep {
                    id: "prepare_decks".to_string(),
                    title: "Analyze tracks and prepare deck crates".to_string(),
                    completed: false,
                    action_id: "analyze_library".to_string(),
                },
                OnboardingStep {
                    id: "configure_show".to_string(),
                    title: "Verify show cues and safety fallback".to_string(),
                    completed: false,
                    action_id: "show_validation".to_string(),
                },
            ],
            last_opened_unix_ms: None,
        }
    }
}

/// Aggregated system health snapshot for operations dashboard.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemHealthSnapshot {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub captured_unix_ms: Option<i64>,
    pub transport_ready: bool,
    pub audio_ready: bool,
    pub show_ready: bool,
    pub device_health_score: f64,
    pub pending_errors: u32,
    pub recent_warning_count: u32,
    #[serde(default)]
    pub status_indicators: Vec<StatusIndicatorState>,
}

impl Default for SystemHealthSnapshot {
    fn default() -> Self {
        Self {
            captured_unix_ms: None,
            transport_ready: true,
            audio_ready: true,
            show_ready: true,
            device_health_score: 1.0,
            pending_errors: 0,
            recent_warning_count: 0,
            status_indicators: vec![],
        }
    }
}

/// Root project container. Persisted to disk as JSON.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub version: u32,
    pub title: String,
    pub bpm: f64,
    /// Sample rate used for timeline (e.g. 44100).
    pub sample_rate: u32,
    /// Imported audio file references.
    pub media: Vec<MediaAsset>,
    /// Arrangement tracks (audio and MIDI).
    pub tracks: Vec<Track>,
    /// Optional loop region.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loop_region: Option<LoopRegion>,
    /// Session launcher domain.
    #[serde(default)]
    pub session: SessionState,
    /// Automation domain.
    #[serde(default)]
    pub automation_lanes: Vec<AutomationLane>,
    /// Mixer/routing domain.
    #[serde(default)]
    pub routing: RoutingState,
    /// Browser indexing and tagging state.
    #[serde(default)]
    pub browser_index: BrowserIndexState,
    /// Template metadata used in project creation flows.
    #[serde(default)]
    pub templates: Vec<TemplateDefinition>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_template_id: Option<String>,
    /// Discovered VST3 plugin descriptors.
    #[serde(default)]
    pub plugin_registry: Vec<PluginDescriptor>,
    /// Sidechain routes.
    #[serde(default)]
    pub sidechain_routes: Vec<SidechainRoute>,
    /// Render/export jobs history.
    #[serde(default)]
    pub render_jobs: Vec<RenderJob>,
    /// Recovery snapshots (metadata only).
    #[serde(default)]
    pub recovery_snapshots: Vec<RecoverySnapshot>,
    /// Keyboard shortcut bindings.
    #[serde(default)]
    pub shortcuts: Vec<ShortcutBinding>,
    /// Monitoring preferences.
    #[serde(default)]
    pub monitoring: MonitoringState,
    /// Autosave interval in seconds.
    #[serde(default = "default_autosave_interval_secs")]
    pub autosave_interval_secs: u32,
    /// Unified mode navigation state.
    #[serde(default)]
    pub navigation: NavigationState,
    /// User preferences and low-light behavior.
    #[serde(default)]
    pub preferences: UserPreferences,
    /// Cached known hardware/software device profiles.
    #[serde(default)]
    pub device_profiles: Vec<DeviceProfile>,
    /// Most recent device diagnostics run.
    #[serde(default)]
    pub device_diagnostics: DeviceDiagnosticState,
    /// Compatibility reports for project/library/show migration checks.
    #[serde(default)]
    pub compatibility_reports: Vec<CompatibilityReport>,
    /// Migration plans history.
    #[serde(default)]
    pub migration_history: Vec<MigrationPlan>,
    /// Captured application/runtime error reports.
    #[serde(default)]
    pub error_reports: Vec<ErrorReport>,
    /// Support export bundles metadata.
    #[serde(default)]
    pub support_bundles: Vec<SupportBundle>,
    /// Performance profile from latest diagnostics pass.
    #[serde(default)]
    pub performance_profile: PerformanceProfile,
    /// Release packaging configuration and readiness controls.
    #[serde(default)]
    pub release_config: ReleaseConfig,
    /// In-app onboarding/help state.
    #[serde(default)]
    pub onboarding: OnboardingState,
    /// Last computed system-health summary.
    #[serde(default)]
    pub system_health: SystemHealthSnapshot,
    /// Asset classifications generated by smart browser assistant.
    #[serde(default)]
    pub asset_classifications: Vec<AssetClassification>,
    /// Dashboard widget visibility and dismissed state.
    #[serde(default)]
    pub dashboard_widget_state: DashboardWidgetState,
    /// Live performance mode status.
    #[serde(default)]
    pub performance_mode: PerformanceModeState,
    /// Performance macros for stage control.
    #[serde(default)]
    pub performance_macros: Vec<PerformanceMacro>,
    /// Trigger map for scenes/macros.
    #[serde(default)]
    pub scene_triggers: Vec<SceneTrigger>,
    /// Show-control cues.
    #[serde(default)]
    pub show_cues: Vec<ShowCue>,
    /// Links between macros and cues.
    #[serde(default)]
    pub lighting_cue_bindings: Vec<LightingCueBinding>,
    /// Visual sync bridge state.
    #[serde(default)]
    pub visual_sync: VisualSyncState,
    /// Branding configuration and theme tokens.
    #[serde(default)]
    pub branding: BrandingConfig,
    /// DJ library items.
    #[serde(default)]
    pub library_items: Vec<LibraryItem>,
    /// DJ crates.
    #[serde(default)]
    pub crates: Vec<Crate>,
    /// Dual-deck state.
    #[serde(default = "Project::default_decks")]
    pub decks: Vec<DeckState>,
    /// Deck sync domain.
    #[serde(default)]
    pub deck_sync: DeckSyncState,
    /// Crossfader bridge domain.
    #[serde(default)]
    pub crossfader: CrossfaderState,
    /// Sampler slots for live remix.
    #[serde(default)]
    pub sampler_slots: Vec<SamplerSlot>,
    /// Performance pad mappings.
    #[serde(default)]
    pub performance_pads: Vec<PerformancePad>,
    /// Setlists for show preparation and execution.
    #[serde(default)]
    pub setlists: Vec<Setlist>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_setlist_id: Option<String>,
    /// Executable show triggers and protocol bindings.
    #[serde(default)]
    pub show_triggers: Vec<ShowTrigger>,
    /// Deck event -> show trigger bindings.
    #[serde(default)]
    pub deck_event_bindings: Vec<DeckEventBinding>,
    /// Session scene -> deck coordination links.
    #[serde(default)]
    pub deck_scene_links: Vec<DeckSceneLink>,
    /// Phase 7 show engine, cue sequencing, safety and device binding domain.
    #[serde(default)]
    pub show_project: ShowProject,
}

impl Project {
    fn default_decks() -> Vec<DeckState> {
        vec![DeckState::new("A", 120.0), DeckState::new("B", 120.0)]
    }
}

impl Default for Project {
    fn default() -> Self {
        Self {
            version: PROJECT_SCHEMA_VERSION,
            title: "Untitled".to_string(),
            bpm: 120.0,
            sample_rate: 44100,
            media: Vec::new(),
            tracks: Vec::new(),
            loop_region: None,
            session: SessionState::default(),
            automation_lanes: Vec::new(),
            routing: RoutingState::default(),
            browser_index: BrowserIndexState::default(),
            templates: Vec::new(),
            active_template_id: None,
            plugin_registry: Vec::new(),
            sidechain_routes: Vec::new(),
            render_jobs: Vec::new(),
            recovery_snapshots: Vec::new(),
            shortcuts: Vec::new(),
            monitoring: MonitoringState::default(),
            autosave_interval_secs: default_autosave_interval_secs(),
            navigation: NavigationState::default(),
            preferences: UserPreferences::default(),
            device_profiles: vec![],
            device_diagnostics: DeviceDiagnosticState::default(),
            compatibility_reports: vec![],
            migration_history: vec![],
            error_reports: vec![],
            support_bundles: vec![],
            performance_profile: PerformanceProfile::default(),
            release_config: ReleaseConfig::default(),
            onboarding: OnboardingState::default(),
            system_health: SystemHealthSnapshot::default(),
            asset_classifications: Vec::new(),
            dashboard_widget_state: DashboardWidgetState::default(),
            performance_mode: PerformanceModeState::default(),
            performance_macros: Vec::new(),
            scene_triggers: Vec::new(),
            show_cues: Vec::new(),
            lighting_cue_bindings: Vec::new(),
            visual_sync: VisualSyncState::default(),
            branding: BrandingConfig::default(),
            library_items: Vec::new(),
            crates: Vec::new(),
            decks: Self::default_decks(),
            deck_sync: DeckSyncState::default(),
            crossfader: CrossfaderState::default(),
            sampler_slots: Vec::new(),
            performance_pads: Vec::new(),
            setlists: Vec::new(),
            active_setlist_id: None,
            show_triggers: Vec::new(),
            deck_event_bindings: Vec::new(),
            deck_scene_links: Vec::new(),
            show_project: ShowProject::default(),
        }
    }
}

/// Imported audio/file asset.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaAsset {
    pub id: String,
    pub name: String,
    /// Absolute path at import time.
    pub path: String,
    pub duration_secs: f64,
    pub sample_rate: u32,
    pub channels: u16,
}

/// A single track in the arrangement (audio or MIDI).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub id: String,
    pub name: String,
    /// 0-based order in arrangement.
    pub index: u32,
    /// Track type discriminant.
    #[serde(default)]
    pub track_type: TrackType,
    /// Audio clips (for audio tracks).
    pub clips: Vec<TimelineClip>,
    /// MIDI clips (for MIDI tracks).
    #[serde(default)]
    pub midi_clips: Vec<MidiClip>,
    /// Assigned instrument (optional).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instrument: Option<InstrumentAssignment>,
    /// Mixer controls.
    #[serde(default = "default_track_volume_db")]
    pub volume_db: f64,
    #[serde(default)]
    pub pan: f64,
    #[serde(default)]
    pub muted: bool,
    #[serde(default)]
    pub solo: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_track_id: Option<String>,
    /// Plugin processing chain.
    #[serde(default)]
    pub plugin_chain: PluginChain,
    /// Track freeze state.
    #[serde(default)]
    pub freeze_state: FreezeState,
    /// Recording take lanes.
    #[serde(default)]
    pub take_lanes: Vec<TakeLane>,
    /// Comp regions.
    #[serde(default)]
    pub comp_regions: Vec<CompRegion>,
    /// Track record arm.
    #[serde(default)]
    pub armed: bool,
}

/// A clip placed on the timeline (references a media asset).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineClip {
    pub id: String,
    pub media_asset_id: String,
    pub start_secs: f64,
    pub source_offset_secs: f64,
    pub duration_secs: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warp: Option<WarpState>,
    #[serde(default)]
    pub slice_markers: Vec<SliceMarker>,
}
