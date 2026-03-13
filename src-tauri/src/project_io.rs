//! Project save/load. JSON format with schema version for future compatibility.

use crate::models::{Project, PROJECT_SCHEMA_VERSION};
use std::path::Path;
use std::fs;

/// Serialize project to JSON and write to path.
pub fn save_project(project: &Project, path: &Path) -> Result<(), String> {
    let json = serde_json::to_string_pretty(project).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(())
}

/// Read project from JSON file. Validates schema version.
pub fn load_project(path: &Path) -> Result<Project, String> {
    let contents = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let project: Project = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
    if project.version > PROJECT_SCHEMA_VERSION {
        return Err(format!(
            "Project schema v{} is newer than supported v{}",
            project.version, PROJECT_SCHEMA_VERSION
        ));
    }
    Ok(project)
}
