use std::fs;
use std::path::PathBuf;

use tauri::State;

use crate::state::AppState;
use crate::types::Settings;

/// Returns the path to settings.json.
/// In production: next to the executable.
/// In development: falls back to exe directory (works with npm run dev).
fn get_settings_path() -> Result<PathBuf, String> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("Failed to get executable path: {}", e))?
        .parent()
        .ok_or("Failed to get executable parent directory")?
        .to_path_buf();
    Ok(exe_dir.join("settings.json"))
}

/// Loads settings from the settings file, returning defaults if the file doesn't exist.
fn load_settings_from_file() -> Settings {
    match get_settings_path() {
        Ok(path) => {
            if path.exists() {
                match fs::read_to_string(&path) {
                    Ok(content) => match serde_json::from_str(&content) {
                        Ok(settings) => {
                            eprintln!("Loaded settings from {:?}", path);
                            return settings;
                        }
                        Err(e) => {
                            eprintln!("Failed to parse settings file: {}", e);
                        }
                    },
                    Err(e) => {
                        eprintln!("Failed to read settings file: {}", e);
                    }
                }
            }
        }
        Err(e) => {
            eprintln!("Failed to get settings path: {}", e);
        }
    }

    // Return defaults if file doesn't exist or failed to read
    Settings {
        api_key: String::new(),
        model: "gpt-4o-mini".to_string(),
        endpoint: "https://api.openai.com/v1/chat/completions".to_string(),
    }
}

/// Saves settings to the settings file.
fn save_settings_to_file(settings: &Settings) -> Result<(), String> {
    let path = get_settings_path()?;
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    // Ensure parent directory exists (in case we're in a new location)
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    fs::write(&path, content).map_err(|e| format!("Failed to write settings file: {}", e))?;
    eprintln!("Saved settings to {:?}", path);
    Ok(())
}

#[tauri::command]
pub fn update_settings(state: State<'_, AppState>, settings: Settings) -> Result<(), String> {
    // Update in-memory state
    *state.api_key.lock().map_err(|e| e.to_string())? = settings.api_key.clone();
    *state.model.lock().map_err(|e| e.to_string())? = settings.model.clone();
    *state.endpoint.lock().map_err(|e| e.to_string())? = settings.endpoint.clone();

    // Persist to file
    save_settings_to_file(&settings)
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    // Try to load from file first (to get persisted values)
    let file_settings = load_settings_from_file();

    // Update in-memory state with loaded values
    *state.api_key.lock().map_err(|e| e.to_string())? = file_settings.api_key.clone();
    *state.model.lock().map_err(|e| e.to_string())? = file_settings.model.clone();
    *state.endpoint.lock().map_err(|e| e.to_string())? = file_settings.endpoint.clone();

    // Return the settings
    Ok(Settings {
        api_key: file_settings.api_key,
        model: file_settings.model,
        endpoint: file_settings.endpoint,
    })
}
