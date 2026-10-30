pub mod commands;
pub mod db;
pub mod domain;
pub mod timer;

use commands::AppState;
use std::sync::Mutex;
use tauri::{Emitter, Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = match std::env::var_os("STUDY_CHRONO_DATA_DIR") {
                Some(custom_dir) if !custom_dir.is_empty() => std::path::PathBuf::from(custom_dir),
                _ => app.path().app_data_dir()?,
            };
            let (conn, recovered) = db::init_db(&app_data_dir)
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
            app.manage(Mutex::new(AppState::new(conn, recovered)));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let mut should_block = false;
                if let Some(state) = window.try_state::<Mutex<AppState>>()
                    && let Ok(guard) = state.lock()
                {
                    if guard.has_active_session() {
                        should_block = true;
                    } else {
                        guard.checkpoint_wal();
                    }
                }

                if should_block {
                    api.prevent_close();
                    let _ = window.emit("close-requested", ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_session_snapshot,
            commands::start_or_switch_modality,
            commands::toggle_pause,
            commands::update_session_metadata,
            commands::stop_session,
            commands::get_initial_data,
            commands::get_history_data,
            commands::update_history_session,
            commands::delete_history_session,
            commands::confirm_close_and_exit,
        ])
        .run(tauri::generate_context!())
        .expect("Erro ao executar a aplicação StudyChrono");
}
