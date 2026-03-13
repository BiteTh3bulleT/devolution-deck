//! DEVOLUTION//DECK — core library and Tauri plugin.

mod audio;
mod commands;
mod models;
mod project_io;

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let playback = audio::PlaybackHandle::new().expect("Failed to init audio playback");
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            project: std::sync::Mutex::new(models::Project::default()),
            project_path: std::sync::Mutex::new(None),
            playback,
        })
        .invoke_handler(tauri::generate_handler![
            commands::project_new,
            commands::project_save,
            commands::project_open,
            commands::project_get,
            commands::project_update,
            commands::media_import_audio,
            commands::waveform_peaks,
            commands::track_add,
            commands::clip_place,
            commands::playback_play,
            commands::playback_stop,
            commands::playback_position_ms,
            commands::playback_is_playing,
        ])
        .run(tauri::generate_context!())
        .expect("error while running DEVOLUTION//DECK");
}
