use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

// --- App State ---

struct AppState {
    api_key: Mutex<String>,
    model: Mutex<String>,
    endpoint: Mutex<String>,
    client: reqwest::Client,
}

// --- Data Types ---

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    api_key: String,
    model: String,
    endpoint: String,
}

// --- Tauri Commands ---

#[tauri::command]
async fn send_message_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    messages: Vec<ChatMessage>,
) -> Result<(), String> {
    let api_key = state.api_key.lock().map_err(|e| e.to_string())?.clone();
    let model = state.model.lock().map_err(|e| e.to_string())?.clone();
    let endpoint = state.endpoint.lock().map_err(|e| e.to_string())?.clone();

    if api_key.is_empty() {
        return Err("API key not set. Open Settings (gear icon) and configure your API key.".into());
    }

    let request_body = ChatCompletionRequest {
        model,
        messages,
        stream: true,
    };

    let response = state
        .client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_else(|_| "Unknown error".into());
        return Err(format!("API error ({}): {}", status, body));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Stream error: {}", e))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim_end().to_string();
            buffer = buffer[pos + 1..].to_string();

            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    app.emit_all("stream-end", ())
                        .map_err(|e| format!("Event error: {}", e))?;
                    return Ok(());
                }

                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(content) = parsed["choices"][0]["delta"]["content"].as_str() {
                        app.emit_all("stream-token", content)
                            .map_err(|e| format!("Event error: {}", e))?;
                    }
                }
            }
        }
    }

    app.emit_all("stream-end", ())
        .map_err(|e| format!("Event error: {}", e))?;
    Ok(())
}

#[tauri::command]
fn update_settings(state: State<'_, AppState>, settings: Settings) -> Result<(), String> {
    *state.api_key.lock().map_err(|e| e.to_string())? = settings.api_key;
    *state.model.lock().map_err(|e| e.to_string())? = settings.model;
    *state.endpoint.lock().map_err(|e| e.to_string())? = settings.endpoint;
    Ok(())
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    Ok(Settings {
        api_key: state.api_key.lock().map_err(|e| e.to_string())?.clone(),
        model: state.model.lock().map_err(|e| e.to_string())?.clone(),
        endpoint: state.endpoint.lock().map_err(|e| e.to_string())?.clone(),
    })
}

// --- Filesystem Commands ---

#[tauri::command]
fn load_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read '{}': {}", path, e))
}

#[tauri::command]
fn save_file(path: String, content: String) -> Result<(), String> {
    // Create parent directories if they don't exist
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory '{}': {}", parent.display(), e))?;
    }
    fs::write(&path, &content).map_err(|e| format!("Failed to write '{}': {}", path, e))
}

#[tauri::command]
fn list_characters(work_folder: String) -> Result<Vec<String>, String> {
    let dir = fs::read_dir(&work_folder)
        .map_err(|e| format!("Failed to read directory '{}': {}", work_folder, e))?;

    let mut names: Vec<String> = dir
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.is_dir() {
                let name = path.file_name()?.to_str()?.to_string();
                // Skip hidden directories (e.g. .git)
                if !name.starts_with('.') {
                    return Some(name);
                }
            }
            None
        })
        .collect();

    names.sort();
    Ok(names)
}

// --- Main ---

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
