use std::sync::Mutex;
mod commands;
mod state;
mod types;

use commands::characters::{create_character, list_characters};
use commands::files::{load_file, save_file};
use commands::git::{git_commit, git_log, git_revert};
use commands::settings::{get_settings, update_settings};
use commands::stream_chat::send_message_stream;
use state::AppState;

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            api_key: Mutex::new(String::new()),
            model: Mutex::new("gpt-4o-mini".to_string()),
            endpoint: Mutex::new("https://api.openai.com/v1/chat/completions".to_string()),
            client: reqwest::Client::new(),
        })
        .invoke_handler(tauri::generate_handler![
            send_message_stream,
            update_settings,
            get_settings,
            load_file,
            save_file,
            list_characters,
            create_character,
            git_commit,
            git_log,
            git_revert,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
