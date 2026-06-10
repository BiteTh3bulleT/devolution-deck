//! Phase 6 DJ deck helpers: metadata analysis, sync math, and crossfader utilities.

use crate::models::{
    BeatGrid, CrossfaderSide, CuePoint, DeckState, KeyAnalysis, LibraryItem, MediaAsset,
    PhraseMarker,
};
use uuid::Uuid;

fn strip_extension(name: &str) -> String {
    let mut parts = name.rsplitn(2, '.');
    let ext = parts.next().unwrap_or_default();
    let stem = parts.next().unwrap_or(name);
    if ext.len() <= 5 && !stem.is_empty() {
        stem.to_string()
    } else {
        name.to_string()
    }
}

fn split_title_artist(stem: &str) -> (String, String) {
    let separators = [" - ", " — ", " – ", "_-_"];
    for sep in separators {
        if let Some((artist, title)) = stem.split_once(sep) {
            return (title.trim().to_string(), artist.trim().to_string());
        }
    }
    (stem.trim().to_string(), "Unknown Artist".to_string())
}

fn detect_bpm_from_filename(name: &str) -> Option<f64> {
    let mut digits = String::new();
    let mut matches = Vec::new();
    for ch in name.chars() {
        if ch.is_ascii_digit() {
            digits.push(ch);
        } else if !digits.is_empty() {
            if let Ok(v) = digits.parse::<u32>() {
                matches.push(v as f64);
            }
            digits.clear();
        }
    }
    if !digits.is_empty() {
        if let Ok(v) = digits.parse::<u32>() {
            matches.push(v as f64);
        }
    }
    matches
        .into_iter()
        .find(|v| (70.0..=180.0).contains(v))
        .map(|v| (v * 10.0).round() / 10.0)
}

fn estimate_bpm_from_duration(duration_secs: f64, project_bpm: f64) -> Option<f64> {
    if duration_secs <= 0.0 {
        return None;
    }
    let mut best: Option<(f64, f64)> = None;
    for bars in 16..=512 {
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
    best.map(|(bpm, _)| (bpm * 10.0).round() / 10.0)
}

fn normalize_key_token(token: &str) -> Option<(String, String)> {
    let t = token.trim().to_ascii_uppercase().replace("MIN", "M");
    if t.len() < 1 || t.len() > 4 {
        return None;
    }
    if t.len() == 2 && t.ends_with('A') {
        if let Ok(num) = t[0..1].parse::<u8>() {
            if (1..=9).contains(&num) {
                return Some((format!("{num}A"), "minor".to_string()));
            }
        }
    }
    if t.len() == 3 && (t.ends_with('A') || t.ends_with('B')) {
        if let Ok(num) = t[0..2].parse::<u8>() {
            if (10..=12).contains(&num) {
                let scale = if t.ends_with('A') { "minor" } else { "major" };
                return Some((format!("{num}{}", &t[2..]), scale.to_string()));
            }
        }
    }

    let major_keys = [
        "C", "G", "D", "A", "E", "B", "F#", "C#", "DB", "AB", "EB", "BB", "F",
    ];
    let minor_keys = [
        "AM", "EM", "BM", "F#M", "C#M", "G#M", "D#M", "A#M", "FM", "CM", "GM", "DM",
    ];

    if major_keys.contains(&t.as_str()) {
        let key = match t.as_str() {
            "DB" => "Db".to_string(),
            "AB" => "Ab".to_string(),
            "EB" => "Eb".to_string(),
            "BB" => "Bb".to_string(),
            _ => t.clone(),
        };
        return Some((key, "major".to_string()));
    }
    if minor_keys.contains(&t.as_str()) {
        let raw = t.trim_end_matches('M');
        let key = match raw {
            "DB" => "Db".to_string(),
            "AB" => "Ab".to_string(),
            "EB" => "Eb".to_string(),
            "BB" => "Bb".to_string(),
            _ => raw.to_string(),
        };
        return Some((key, "minor".to_string()));
    }
    None
}

fn key_to_camelot(key: &str, scale: &str) -> Option<String> {
    let mut k = key.trim().to_string();
    if k.ends_with('m') || k.ends_with('M') {
        k.pop();
    }
    let k = k
        .replace("♯", "#")
        .replace("♭", "b")
        .replace("DB", "Db")
        .replace("AB", "Ab")
        .replace("EB", "Eb")
        .replace("BB", "Bb");
    let major_map = [
        ("B", "1B"),
        ("F#", "2B"),
        ("C#", "3B"),
        ("G#", "4B"),
        ("D#", "5B"),
        ("A#", "6B"),
        ("F", "7B"),
        ("C", "8B"),
        ("G", "9B"),
        ("D", "10B"),
        ("A", "11B"),
        ("E", "12B"),
        ("Db", "3B"),
        ("Ab", "4B"),
        ("Eb", "5B"),
        ("Bb", "6B"),
    ];
    let minor_map = [
        ("G#", "1A"),
        ("D#", "2A"),
        ("A#", "3A"),
        ("F", "4A"),
        ("C", "5A"),
        ("G", "6A"),
        ("D", "7A"),
        ("A", "8A"),
        ("E", "9A"),
        ("B", "10A"),
        ("F#", "11A"),
        ("C#", "12A"),
        ("Ab", "1A"),
        ("Eb", "2A"),
        ("Bb", "3A"),
    ];
    if scale.eq_ignore_ascii_case("minor") {
        return minor_map
            .iter()
            .find(|(mk, _)| mk.eq_ignore_ascii_case(k.as_str()))
            .map(|(_, c)| (*c).to_string());
    }
    major_map
        .iter()
        .find(|(mk, _)| mk.eq_ignore_ascii_case(k.as_str()))
        .map(|(_, c)| (*c).to_string())
}

fn detect_key_analysis(name: &str) -> Option<KeyAnalysis> {
    let tokens = name
        .split(|c: char| !(c.is_ascii_alphanumeric() || c == '#' || c == 'b'))
        .filter(|token| !token.is_empty());

    for token in tokens {
        if let Some((key, scale)) = normalize_key_token(token) {
            let camelot = if key.ends_with('A') || key.ends_with('B') {
                Some(key.clone())
            } else {
                key_to_camelot(&key, &scale)
            };
            return Some(KeyAnalysis {
                key,
                scale,
                camelot,
                confidence: 0.62,
                source: "filename_heuristic".to_string(),
            });
        }
    }
    None
}

fn build_phrase_markers(duration_secs: f64, bpm: f64) -> Vec<PhraseMarker> {
    if duration_secs <= 0.0 || bpm <= 0.0 {
        return vec![];
    }
    let phrase_secs = 60.0 / bpm * 4.0 * 8.0;
    let mut out = Vec::new();
    let mut idx = 0u32;
    let mut start = 0.0;
    while start < duration_secs {
        out.push(PhraseMarker {
            id: Uuid::new_v4().to_string(),
            start_secs: start,
            length_bars: 8,
            energy: 0.45 + ((idx % 4) as f64 * 0.12),
            label: Some(format!("Phrase {}", idx + 1)),
        });
        idx += 1;
        start += phrase_secs;
    }
    out
}

pub fn analyze_asset_to_library_item(
    asset: &MediaAsset,
    project_bpm: f64,
    now_unix_ms: i64,
) -> LibraryItem {
    let stem = strip_extension(&asset.name);
    let (title, artist) = split_title_artist(&stem);
    let bpm = detect_bpm_from_filename(&asset.name)
        .or_else(|| estimate_bpm_from_duration(asset.duration_secs, project_bpm));
    let beat_grid = bpm.map(|v| BeatGrid {
        bpm: v,
        offset_secs: 0.0,
        confidence: 0.58,
    });
    let key_analysis = detect_key_analysis(&asset.name);
    let phrase_markers =
        build_phrase_markers(asset.duration_secs, bpm.unwrap_or(project_bpm.max(1.0)));

    let mut cue_points = vec![CuePoint {
        id: Uuid::new_v4().to_string(),
        label: "Start".to_string(),
        position_secs: 0.0,
        color_hex: Some("#38d7ff".to_string()),
    }];
    if let Some(track_bpm) = bpm {
        let drop_pos = (60.0 / track_bpm) * 4.0 * 32.0;
        if drop_pos < asset.duration_secs {
            cue_points.push(CuePoint {
                id: Uuid::new_v4().to_string(),
                label: "Drop".to_string(),
                position_secs: drop_pos,
                color_hex: Some("#ff6b1a".to_string()),
            });
        }
    }

    LibraryItem {
        id: Uuid::new_v4().to_string(),
        media_asset_id: asset.id.clone(),
        title,
        artist,
        album: None,
        genre: None,
        bpm,
        beat_grid,
        key_analysis,
        phrase_markers,
        cue_points,
        saved_loops: vec![],
        rating: 0,
        comment: None,
        added_unix_ms: now_unix_ms,
        last_played_unix_ms: None,
        play_count: 0,
    }
}

pub fn crossfader_gains(position: f64, curve: f64) -> (f64, f64) {
    let pos = position.clamp(-1.0, 1.0);
    let c = curve.clamp(0.0, 1.0);
    let t = (pos + 1.0) * 0.5;
    let linear_a = 1.0 - t;
    let linear_b = t;
    let shaped_a = (1.0 - t).powf(1.0 + c * 3.0);
    let shaped_b = t.powf(1.0 + c * 3.0);
    let a = linear_a * (1.0 - c) + shaped_a * c;
    let b = linear_b * (1.0 - c) + shaped_b * c;
    (a.clamp(0.0, 1.0), b.clamp(0.0, 1.0))
}

pub fn side_gain(side: &CrossfaderSide, gain_a: f64, gain_b: f64) -> f64 {
    match side {
        CrossfaderSide::Left => gain_a,
        CrossfaderSide::Right => gain_b,
        CrossfaderSide::Center => gain_a.max(gain_b),
    }
}

pub fn sync_follower(master: &DeckState, follower: &mut DeckState, quantize_beats: u32) {
    follower.tempo_bpm = master.tempo_bpm;
    follower.tempo_multiplier = master.tempo_multiplier;
    if quantize_beats > 0 {
        let q = quantize_beats as f64;
        follower.beat_phase = (master.beat_phase / q).round() * q;
    } else {
        follower.beat_phase = master.beat_phase;
    }
    follower.position_secs = master.position_secs;
}
