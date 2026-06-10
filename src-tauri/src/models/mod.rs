//! Domain models for DEVOLUTION//DECK.
//! Shared structures used by persistence, audio, and frontend.
pub mod midi;
mod project;
pub mod recording;
mod transport;

pub use midi::{MidiClip, TICKS_PER_BEAT};
#[allow(unused_imports)]
pub use project::{
    AppMode, AssetClassification, AssistantPluginStep, AssistantPreset, AutomationLane,
    AutomationPoint, BeatGrid, BlackoutState,
    BrandingConfig, BrowserAssetIndexEntry, BrowserIndexState, BrowserTag, ChordSuggestion,
    CompRegion, CompatibilityReport, Crate, CrossfaderSide, CrossfaderState,
    CrossfaderTrackBinding, CuePoint, CueSequence, CueSequenceStep, CueTrigger,
    DashboardWidgetState, DeckEventBinding, DeckSceneLink, DeckState, DeckSyncState,
    DeckTrackReference, DeviceBinding, DeviceDiagnosticState, DeviceProfile, DmxBinding,
    DmxBridgeConfig, DmxUniverseState, ErrorReport, FallbackProfile, FreezeState,
    HarmonySuggestionPack, InstrumentAssignment, KeyAnalysis, LibraryItem, LightingChannelValue,
    LightingCue, LightingCueBinding, LoopRegion, LoopState, MediaAsset, MidiBinding, MigrationPlan,
    MigrationStep, MonitoringState, NavigationState, OnboardingState, OnboardingStep, OscBinding,
    PanicAction, PerformanceDashboardState, PerformanceMacro, PerformanceModeState, PerformancePad,
    PerformanceProfile, PhraseMarker, PluginDescriptor, PluginInstance, PluginParameterState,
    ProducerInsight, ProgressionSuggestion, Project, RecoveryAction, RecoverySnapshot,
    ReleaseConfig, ReleaseReadinessCheck, RenderJob, RoutingState, SafetyState, SamplerSlot,
    SceneTrigger, SessionState, Setlist, SetlistEntry, ShortcutBinding, ShowCue, ShowProject,
    ShowTrigger, SidechainRoute, SongCueMap, StatusIndicatorState, SupportBundle, SyncEvent,
    SystemHealthSnapshot, TakeClip, TakeLane, TimelineClip, Track, TrackType, UserPreferences,
    VisualCue, VisualSyncState, PROJECT_SCHEMA_VERSION,
};
