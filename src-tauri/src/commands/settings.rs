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
        temperature: 0.7,
        top_p: 1.0,
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
    *state.temperature.lock().map_err(|e| e.to_string())? = settings.temperature;
    *state.top_p.lock().map_err(|e| e.to_string())? = settings.top_p;

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
    *state.temperature.lock().map_err(|e| e.to_string())? = file_settings.temperature;
    *state.top_p.lock().map_err(|e| e.to_string())? = file_settings.top_p;

    // Return the settings
    Ok(Settings {
        api_key: file_settings.api_key,
        model: file_settings.model,
        endpoint: file_settings.endpoint,
        temperature: file_settings.temperature,
        top_p: file_settings.top_p,
    })
}

#[cfg(test)]
mod tests {
    use super::{get_settings_path, load_settings_from_file, save_settings_to_file};
    use crate::types::Settings;
    use std::fs;
    use std::sync::{Mutex, OnceLock};

    fn settings_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
            .lock()
            .expect("settings test lock should succeed")
    }

    fn with_clean_settings_file(test: impl FnOnce(&std::path::Path)) {
        let _guard = settings_lock();
        let path = get_settings_path().expect("settings path should resolve");
        let backup = fs::read(&path).ok();

        if path.exists() {
            fs::remove_file(&path).expect("existing settings file should be removable");
        }

        test(&path);

        if let Some(bytes) = backup {
            fs::write(&path, bytes).expect("settings backup should be restored");
        } else if path.exists() {
            fs::remove_file(&path).expect("temporary settings file should be removed");
        }
    }

    #[test]
    fn load_settings_returns_defaults_when_file_is_missing() {
        with_clean_settings_file(|_| {
            let settings = load_settings_from_file();

            assert_eq!(settings.api_key, "");
            assert_eq!(settings.model, "gpt-4o-mini");
            assert_eq!(
                settings.endpoint,
                "https://api.openai.com/v1/chat/completions"
            );
            assert_eq!(settings.temperature, 0.7);
            assert_eq!(settings.top_p, 1.0);
        });
    }

    #[test]
    fn save_settings_round_trips_through_the_settings_file() {
        with_clean_settings_file(|path| {
            let settings = Settings {
                api_key: "secret".to_string(),
                model: "gpt-4.1-mini".to_string(),
                endpoint: "https://example.test/chat".to_string(),
                temperature: 0.25,
                top_p: 0.9,
            };

            save_settings_to_file(&settings).expect("settings should save");

            let raw = fs::read_to_string(path).expect("settings file should exist");
            let loaded = load_settings_from_file();

            assert!(raw.contains("gpt-4.1-mini"));
            assert_eq!(loaded.api_key, "secret");
            assert_eq!(loaded.model, "gpt-4.1-mini");
            assert_eq!(loaded.endpoint, "https://example.test/chat");
            assert_eq!(loaded.temperature, 0.25);
            assert_eq!(loaded.top_p, 0.9);
        });
    }

    #[test]
    fn load_settings_uses_default_numeric_values_for_partial_json() {
        with_clean_settings_file(|path| {
            fs::write(
                path,
                r#"{
  "apiKey": "partial",
  "model": "model-x",
  "endpoint": "https://example.test/chat"
}"#,
            )
            .expect("partial settings file should be written");

            let loaded = load_settings_from_file();

            assert_eq!(loaded.api_key, "partial");
            assert_eq!(loaded.model, "model-x");
            assert_eq!(loaded.endpoint, "https://example.test/chat");
            assert_eq!(loaded.temperature, 0.7);
            assert_eq!(loaded.top_p, 1.0);
        });
    }
}
