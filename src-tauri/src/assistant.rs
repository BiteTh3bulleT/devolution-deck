//! Phase 5 producer assistant foundation.
//! Implements deterministic rule-based helpers behind AI service-style interfaces.

use crate::models::{
    AssetClassification, AssistantPluginStep, AssistantPreset, ChordSuggestion,
    HarmonySuggestionPack, PluginDescriptor, PluginParameterState, ProducerInsight,
    ProgressionSuggestion, Project,
};
use uuid::Uuid;

fn normalize_key_root(key_root: &str) -> String {
    let key = key_root.trim().to_uppercase();
    if key.is_empty() {
        "C".to_string()
    } else {
        key
    }
}

fn diatonic_chords(scale: &str) -> Vec<(&'static str, &'static str)> {
    match scale.to_ascii_lowercase().as_str() {
        "minor" | "aeolian" => vec![
            ("i", "m"),
            ("ii°", "dim"),
            ("III", ""),
            ("iv", "m"),
            ("v", "m"),
            ("VI", ""),
            ("VII", ""),
        ],
        _ => vec![
            ("I", ""),
            ("ii", "m"),
            ("iii", "m"),
            ("IV", ""),
            ("V", ""),
            ("vi", "m"),
            ("vii°", "dim"),
        ],
    }
}

fn progression_templates(
    scale: &str,
    energy: f64,
) -> Vec<(&'static str, &'static str, Vec<usize>)> {
    let is_minor = matches!(scale.to_ascii_lowercase().as_str(), "minor" | "aeolian");
    let high = energy >= 0.66;
    if is_minor {
        if high {
            vec![
                ("Festival Driver", "aggressive", vec![0, 5, 3, 6]),
                ("Dark Lift", "tense", vec![0, 6, 5, 3]),
                ("Peak Pressure", "driving", vec![0, 5, 6, 4]),
            ]
        } else {
            vec![
                ("Emotive Arc", "melodic", vec![0, 5, 2, 6]),
                ("Twilight Flow", "atmospheric", vec![0, 3, 5, 6]),
                ("Late Night", "deep", vec![0, 5, 3, 4]),
            ]
        }
    } else if high {
        vec![
            ("Mainstage Lift", "uplifting", vec![0, 4, 5, 3]),
            ("Hands-Up Cycle", "anthemic", vec![0, 3, 4, 5]),
            ("Bright Push", "energetic", vec![0, 5, 3, 4]),
        ]
    } else {
        vec![
            ("Progressive Bed", "warm", vec![0, 5, 3, 4]),
            ("Skyline", "emotional", vec![0, 3, 5, 4]),
            ("Downtempo Glow", "chill", vec![0, 5, 1, 4]),
        ]
    }
}

pub fn harmony_suggestions(
    key_root: &str,
    scale: &str,
    energy: f64,
    bars: u32,
) -> HarmonySuggestionPack {
    let key = normalize_key_root(key_root);
    let bars = bars.max(4);
    let chord_map = diatonic_chords(scale);
    let templates = progression_templates(scale, energy.clamp(0.0, 1.0));

    let mut suggestions = Vec::new();
    let mut chord_points = Vec::new();

    for (idx, (name, mood, pattern)) in templates.iter().enumerate() {
        let steps = pattern
            .iter()
            .map(|slot| {
                let (roman, quality) = chord_map[*slot % chord_map.len()];
                if quality.is_empty() {
                    format!("{key} {roman}")
                } else {
                    format!("{key} {roman}{quality}")
                }
            })
            .collect::<Vec<_>>();

        let confidence = (0.88 - idx as f64 * 0.08).clamp(0.5, 0.95);
        suggestions.push(ProgressionSuggestion {
            id: Uuid::new_v4().to_string(),
            name: (*name).to_string(),
            mood: (*mood).to_string(),
            bars,
            chords: steps.clone(),
            confidence,
        });

        if idx == 0 {
            let step_bars = (bars / steps.len() as u32).max(1);
            for (chord_idx, step) in steps.iter().enumerate() {
                let roman = chord_map[pattern[chord_idx] % chord_map.len()].0;
                chord_points.push(ChordSuggestion {
                    id: Uuid::new_v4().to_string(),
                    key_root: key.clone(),
                    scale: scale.to_string(),
                    chord: step.clone(),
                    roman: roman.to_string(),
                    start_bar: chord_idx as u32 * step_bars,
                    duration_bars: step_bars,
                    confidence: (0.92 - chord_idx as f64 * 0.04).clamp(0.5, 0.95),
                    tension: (0.2 + chord_idx as f64 * 0.15).clamp(0.0, 1.0),
                });
            }
        }
    }

    HarmonySuggestionPack {
        chords: chord_points,
        progressions: suggestions,
    }
}

fn guess_category(name: &str) -> (&'static str, Option<&'static str>, f64, f64) {
    let n = name.to_ascii_lowercase();
    if n.contains("vocal") || n.contains("vox") || n.contains("acap") {
        return ("vocal", Some("phrase"), 0.91, 0.55);
    }
    if n.contains("kick") {
        return ("drum", Some("kick"), 0.93, 0.92);
    }
    if n.contains("snare") || n.contains("clap") {
        return ("drum", Some("snare_clap"), 0.9, 0.86);
    }
    if n.contains("hat") || n.contains("hihat") {
        return ("drum", Some("hihat"), 0.87, 0.74);
    }
    if n.contains("perc") || n.contains("tom") {
        return ("drum", Some("percussion"), 0.84, 0.76);
    }
    if n.contains("bass") || n.contains("sub") {
        return ("bass", Some("tonal"), 0.88, 0.81);
    }
    if n.contains("lead") || n.contains("pluck") {
        return ("synth", Some("lead"), 0.86, 0.79);
    }
    if n.contains("pad") || n.contains("atmo") {
        return ("synth", Some("pad"), 0.8, 0.45);
    }
    if n.contains("riser") || n.contains("impact") || n.contains("fx") {
        return ("fx", Some("transition"), 0.83, 0.7);
    }
    ("uncategorized", None, 0.45, 0.5)
}

fn estimate_loop_bpm(duration_secs: f64, project_bpm: f64) -> Option<f64> {
    if duration_secs <= 0.0 {
        return None;
    }
    let mut best: Option<(f64, f64)> = None;
    for bars in 1..=16 {
        let beats = bars as f64 * 4.0;
        let bpm = beats * 60.0 / duration_secs;
        if !(70.0..=180.0).contains(&bpm) {
            continue;
        }
        let delta = (bpm - project_bpm).abs();
        match best {
            Some((_, best_delta)) if delta >= best_delta => {}
            _ => best = Some((bpm, delta)),
        }
    }
    best.map(|(bpm, _)| bpm)
}

pub fn classify_assets(project: &Project) -> Vec<AssetClassification> {
    project
        .media
        .iter()
        .map(|asset| {
            let (category, sub_category, mut confidence, energy) = guess_category(&asset.name);
            let estimated_bpm = estimate_loop_bpm(asset.duration_secs, project.bpm);
            let is_loop = estimated_bpm.is_some() && asset.duration_secs >= 0.35;
            if is_loop {
                confidence = (confidence + 0.07).clamp(0.0, 1.0);
            }

            let mut tags = vec![category.to_string()];
            if let Some(sub) = sub_category {
                tags.push(sub.to_string());
            }
            tags.push(if is_loop { "loop" } else { "one_shot" }.to_string());
            if let Some(bpm) = estimated_bpm {
                tags.push(format!("tempo_{:.0}", bpm.round()));
            }

            AssetClassification {
                asset_id: asset.id.clone(),
                category: category.to_string(),
                sub_category: sub_category.map(|s| s.to_string()),
                confidence,
                is_loop,
                estimated_bpm,
                energy,
                suggested_tags: tags,
                reasoning: if is_loop {
                    format!("Keyword and duration analysis suggest {} loop", category)
                } else {
                    format!("Keyword analysis suggests {} one-shot", category)
                },
            }
        })
        .collect()
}

pub fn apply_classification_tags(project: &mut Project, classifications: &[AssetClassification]) {
    for class in classifications {
        for tag in &class.suggested_tags {
            if !project
                .browser_index
                .tags
                .iter()
                .any(|t| t.label.eq_ignore_ascii_case(tag))
            {
                project.browser_index.tags.push(crate::models::BrowserTag {
                    id: Uuid::new_v4().to_string(),
                    label: tag.clone(),
                    color: None,
                });
            }
        }

        let tag_ids: Vec<String> = class
            .suggested_tags
            .iter()
            .filter_map(|label| {
                project
                    .browser_index
                    .tags
                    .iter()
                    .find(|t| t.label.eq_ignore_ascii_case(label))
                    .map(|t| t.id.clone())
            })
            .collect();

        match project
            .browser_index
            .assets
            .iter_mut()
            .find(|entry| entry.asset_id == class.asset_id)
        {
            Some(entry) => {
                for tag_id in tag_ids {
                    if !entry.tag_ids.contains(&tag_id) {
                        entry.tag_ids.push(tag_id);
                    }
                }
            }
            None => project
                .browser_index
                .assets
                .push(crate::models::BrowserAssetIndexEntry {
                    asset_id: class.asset_id.clone(),
                    tag_ids,
                    favorite: false,
                    last_used_unix_ms: None,
                }),
        }
    }
}

pub fn producer_insights(project: &Project) -> Vec<ProducerInsight> {
    let mut insights = Vec::new();

    let untagged_assets = project
        .media
        .iter()
        .filter(|asset| {
            !project
                .browser_index
                .assets
                .iter()
                .find(|entry| entry.asset_id == asset.id)
                .is_some_and(|entry| !entry.tag_ids.is_empty())
        })
        .count() as f64;
    if untagged_assets > 0.0 {
        insights.push(ProducerInsight {
            id: Uuid::new_v4().to_string(),
            title: "Untagged Assets".to_string(),
            description: "Run smart classification to improve browser recall speed.".to_string(),
            severity: "medium".to_string(),
            action_id: "assistant.classify_assets".to_string(),
            value: untagged_assets,
        });
    }

    let frozen_tracks = project
        .tracks
        .iter()
        .filter(|track| track.freeze_state.is_frozen)
        .count() as f64;
    let heavy_tracks = project
        .tracks
        .iter()
        .filter(|track| track.plugin_chain.instances.len() >= 5)
        .count() as f64;
    if heavy_tracks > frozen_tracks {
        insights.push(ProducerInsight {
            id: Uuid::new_v4().to_string(),
            title: "Freeze Opportunity".to_string(),
            description: "Several tracks have dense plugin chains; freeze candidates available."
                .to_string(),
            severity: "low".to_string(),
            action_id: "render.freeze_candidates".to_string(),
            value: heavy_tracks - frozen_tracks,
        });
    }

    let sidechain_exists = !project.sidechain_routes.is_empty();
    if !sidechain_exists {
        let has_kick = project
            .tracks
            .iter()
            .any(|track| track.name.to_ascii_lowercase().contains("kick"));
        let has_bass = project
            .tracks
            .iter()
            .any(|track| track.name.to_ascii_lowercase().contains("bass"));
        if has_kick && has_bass {
            insights.push(ProducerInsight {
                id: Uuid::new_v4().to_string(),
                title: "Missing Kick/Bass Sidechain".to_string(),
                description: "Kick and bass tracks detected without sidechain route.".to_string(),
                severity: "high".to_string(),
                action_id: "routing.add_sidechain".to_string(),
                value: 1.0,
            });
        }
    }

    if project.session.scenes.is_empty() {
        insights.push(ProducerInsight {
            id: Uuid::new_v4().to_string(),
            title: "No Scenes Configured".to_string(),
            description: "Create scenes to unlock live performance workflow.".to_string(),
            severity: "medium".to_string(),
            action_id: "session.create_scene".to_string(),
            value: 1.0,
        });
    }

    insights
}

fn registry_contains(registry: &[PluginDescriptor], descriptor_id: &str) -> bool {
    registry.iter().any(|d| d.id == descriptor_id)
}

pub fn vocal_assistant_presets(registry: &[PluginDescriptor]) -> Vec<AssistantPreset> {
    let compressor_available = registry_contains(registry, "builtin://compressor");
    let deesser_external = registry
        .iter()
        .find(|descriptor| descriptor.name.to_ascii_lowercase().contains("de-ess"))
        .map(|descriptor| descriptor.id.clone());

    let mut clean_chain = vec![
        AssistantPluginStep {
            descriptor_id: "builtin://gain".to_string(),
            parameters: vec![PluginParameterState {
                id: "gain_db".to_string(),
                value: -6.0,
            }],
            optional: false,
        },
        AssistantPluginStep {
            descriptor_id: "builtin://compressor".to_string(),
            parameters: vec![
                PluginParameterState {
                    id: "threshold_db".to_string(),
                    value: -18.0,
                },
                PluginParameterState {
                    id: "ratio".to_string(),
                    value: 3.0,
                },
            ],
            optional: !compressor_available,
        },
        AssistantPluginStep {
            descriptor_id: "builtin://lowpass".to_string(),
            parameters: vec![PluginParameterState {
                id: "cutoff_hz".to_string(),
                value: 16500.0,
            }],
            optional: false,
        },
    ];

    if let Some(external_deesser) = deesser_external {
        clean_chain.push(AssistantPluginStep {
            descriptor_id: external_deesser,
            parameters: vec![],
            optional: true,
        });
    }

    vec![
        AssistantPreset {
            id: "vocal_clean_lead".to_string(),
            name: "Clean Lead Vocal".to_string(),
            category: "vocal_chain".to_string(),
            description: "Gain staging + light compression + top-end control for EDM leads."
                .to_string(),
            steps: clean_chain,
        },
        AssistantPreset {
            id: "vocal_wide_fx".to_string(),
            name: "Wide FX Vocal".to_string(),
            category: "vocal_chain".to_string(),
            description: "Utility chain for hype vocals before delay/reverb sends.".to_string(),
            steps: vec![
                AssistantPluginStep {
                    descriptor_id: "builtin://gain".to_string(),
                    parameters: vec![PluginParameterState {
                        id: "gain_db".to_string(),
                        value: -8.0,
                    }],
                    optional: false,
                },
                AssistantPluginStep {
                    descriptor_id: "builtin://lowpass".to_string(),
                    parameters: vec![PluginParameterState {
                        id: "cutoff_hz".to_string(),
                        value: 14500.0,
                    }],
                    optional: false,
                },
            ],
        },
    ]
}
