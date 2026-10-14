//! Optional headless verification adapter. Never included in the production bundle.
use devolution_deck_lib::lab;
use serde_json::{json, Value};
use std::{
    io::{self, Read},
    path::Path,
};
fn run(request: Value) -> Result<Value, String> {
    let args = &request["args"];
    let path = |key: &str| args[key].as_str().ok_or_else(|| format!("Missing {key}"));
    match request["command"].as_str().unwrap_or("") {
        "project_new" => {
            serde_json::to_value(devolution_deck_lib::Project::default()).map_err(|e| e.to_string())
        }
        "project_patch" => {
            let current =
                serde_json::from_value(args["current"].clone()).map_err(|e| e.to_string())?;
            let baseline =
                serde_json::from_value(args["baseline"].clone()).map_err(|e| e.to_string())?;
            let project =
                serde_json::from_value(args["project"].clone()).map_err(|e| e.to_string())?;
            serde_json::to_value(devolution_deck_lib::apply_project_patch(
                &current, &baseline, &project,
            )?)
            .map_err(|e| e.to_string())
        }
        "audio_lab_preview" => {
            let settings =
                serde_json::from_value(args["settings"].clone()).map_err(|e| e.to_string())?;
            let (rate, samples) = lab::preview_file(Path::new(path("path")?), &settings)?;
            Ok(json!({"sample_rate":rate,"frames":samples.len()/2}))
        }
        "audio_lab_analyze" => serde_json::to_value(lab::analyze_file(Path::new(path("path")?))?)
            .map_err(|e| e.to_string()),
        "audio_lab_process" => {
            let settings =
                serde_json::from_value(args["settings"].clone()).map_err(|e| e.to_string())?;
            serde_json::to_value(lab::process_file(
                Path::new(path("inputPath")?),
                Path::new(path("outputPath")?),
                &settings,
            )?)
            .map_err(|e| e.to_string())
        }
        "audio_lab_generate" => {
            let settings =
                serde_json::from_value(args["settings"].clone()).map_err(|e| e.to_string())?;
            serde_json::to_value(lab::generate_file(
                Path::new(path("outputPath")?),
                &settings,
            )?)
            .map_err(|e| e.to_string())
        }
        "audio_lab_devices" => serde_json::to_value(tauri::async_runtime::block_on(
            devolution_deck_lib::audio_lab_devices(),
        )?)
        .map_err(|e| e.to_string()),
        _ => Err("Unsupported verification command".into()),
    }
}
fn main() {
    let mut input = String::new();
    let result = io::stdin()
        .read_to_string(&mut input)
        .map_err(|e| e.to_string())
        .and_then(|_| serde_json::from_str(&input).map_err(|e| e.to_string()))
        .and_then(run);
    println!(
        "{}",
        match result {
            Ok(data) => json!({"ok":true,"data":data}),
            Err(error) => json!({"ok":false,"error":error}),
        }
    );
}
