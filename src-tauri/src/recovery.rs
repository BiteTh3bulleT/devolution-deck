//! Crash recovery snapshot persistence.

use crate::models::{Project, RecoverySnapshot};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SnapshotFile {
    metadata: RecoverySnapshot,
    project: Project,
}

fn now_unix_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn default_snapshot_dir() -> PathBuf {
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        return PathBuf::from(local)
            .join("devolution-deck")
            .join("recovery");
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home)
            .join(".devolution_deck")
            .join("recovery");
    }
    std::env::temp_dir().join("devolution_deck_recovery")
}

pub fn save_snapshot(project: &Project, reason: &str) -> Result<RecoverySnapshot, String> {
    let dir = default_snapshot_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let created_unix_ms = now_unix_ms();
    let path = dir.join(format!("{id}.decksnap"));
    let metadata = RecoverySnapshot {
        id,
        path: path.to_string_lossy().to_string(),
        created_unix_ms,
        reason: reason.to_string(),
    };
    let data = SnapshotFile {
        metadata: metadata.clone(),
        project: project.clone(),
    };
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    let mut saved: Vec<_> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("decksnap"))
        .collect();
    saved.sort_by_key(|p| std::fs::metadata(p).and_then(|m| m.modified()).ok());
    let excess = saved.len().saturating_sub(100);
    for expired in saved.into_iter().take(excess) {
        let _ = std::fs::remove_file(expired);
    }
    Ok(metadata)
}

pub fn load_snapshot(path: &Path) -> Result<Project, String> {
    let contents = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let snapshot: SnapshotFile = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
    Ok(snapshot.project)
}

pub fn list_snapshots() -> Result<Vec<RecoverySnapshot>, String> {
    let dir = default_snapshot_dir();
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("decksnap") {
            continue;
        }
        let Ok(contents) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Ok(snapshot) = serde_json::from_str::<SnapshotFile>(&contents) else {
            continue;
        };
        out.push(snapshot.metadata);
    }
    out.sort_by(|a, b| b.created_unix_ms.cmp(&a.created_unix_ms));
    Ok(out)
}
