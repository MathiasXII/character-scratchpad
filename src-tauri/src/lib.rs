use std::sync::Mutex;
use std::time::Duration;
pub mod commands;
pub mod state;
pub mod types;

use commands::characters::{create_character, ensure_character_files, list_characters};
use commands::files::{
    copy_file_to_context, create_context_file, delete_context_file, list_context_files, load_file,
    save_file,
};
use commands::git::{
    generate_checkpoint_name, git_commit, git_commit_amend, git_diff_last, git_get_head_content,
    git_is_dirty, git_list_head_folder, git_log, git_revert,
};
use commands::models::fetch_models;
use commands::settings::{get_settings, update_settings};
use commands::stream_chat::send_message_stream;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            api_key: Mutex::new(String::new()),
            model: Mutex::new("zai-org-glm-4.6".to_string()),
            endpoint: Mutex::new("https://api.venice.ai/api/v1".to_string()),
            temperature: Mutex::new(0.7f32),
            top_p: Mutex::new(1.0f32),
            client: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(30))
                .build()
                .expect("Failed to build HTTP client"),
        })
        .invoke_handler(tauri::generate_handler![
            send_message_stream,
            update_settings,
            get_settings,
            load_file,
            save_file,
            list_context_files,
            create_context_file,
            copy_file_to_context,
            delete_context_file,
            list_characters,
            create_character,
            ensure_character_files,
            git_commit,
            git_log,
            git_revert,
            git_is_dirty,
            git_get_head_content,
            git_list_head_folder,
            git_diff_last,
            git_commit_amend,
            generate_checkpoint_name,
            fetch_models,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
