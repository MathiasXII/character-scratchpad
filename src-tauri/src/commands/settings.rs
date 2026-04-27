use std::fs;
use std::path::PathBuf;

use tauri::State;

use crate::state::AppState;
use crate::types::{
    Settings, DEFAULT_ENDPOINT, DEFAULT_MODEL, DEFAULT_TEMPERATURE, DEFAULT_TOP_P,
};

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

/// Strips `/chat/completions` suffix (with optional trailing `/`) from an endpoint URL,
/// then strips any remaining trailing `/`. Used for backward migration of old settings.
fn strip_endpoint_suffix(endpoint: &str) -> String {
    let mut result = endpoint.to_string();
    // Strip /chat/completions with optional trailing /
    if let Some(stripped) = result.strip_suffix("/chat/completions/") {
        result = stripped.to_string();
    } else if let Some(stripped) = result.strip_suffix("/chat/completions") {
        result = stripped.to_string();
    }
    // Strip any remaining trailing /
    while result.ends_with('/') {
        result.pop();
    }
    result
}

/// Strips all trailing `/` characters from an endpoint URL.
fn normalize_endpoint(endpoint: &str) -> String {
    let mut result = endpoint.to_string();
    while result.ends_with('/') {
        result.pop();
    }
    result
}

/// Loads settings from the settings file, returning defaults if the file doesn't exist.
fn load_settings_from_file() -> Settings {
    match get_settings_path() {
        Ok(path) => {
            if path.exists() {
                match fs::read_to_string(&path) {
                    Ok(content) => match serde_json::from_str::<Settings>(&content) {
                        Ok(mut settings) => {
                            // Migrate old endpoint format (full URL) to base URL
                            settings.endpoint = strip_endpoint_suffix(&settings.endpoint);
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
        model: DEFAULT_MODEL.to_string(),
        endpoint: DEFAULT_ENDPOINT.to_string(),
        temperature: DEFAULT_TEMPERATURE,
        top_p: DEFAULT_TOP_P,
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
    let normalized_endpoint = normalize_endpoint(&settings.endpoint);

    // Update in-memory state
    *state.api_key.lock().map_err(|e| e.to_string())? = settings.api_key.clone();
    *state.model.lock().map_err(|e| e.to_string())? = settings.model.clone();
    *state.endpoint.lock().map_err(|e| e.to_string())? = normalized_endpoint.clone();
    *state.temperature.lock().map_err(|e| e.to_string())? = settings.temperature;
    *state.top_p.lock().map_err(|e| e.to_string())? = settings.top_p;

    // Persist to file (with normalized endpoint)
    let mut settings_to_save = settings;
    settings_to_save.endpoint = normalized_endpoint;
    save_settings_to_file(&settings_to_save)
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
    use super::{
        get_settings_path, load_settings_from_file, save_settings_to_file, strip_endpoint_suffix,
    };
    use crate::types::{
        Settings, DEFAULT_ENDPOINT, DEFAULT_MODEL, DEFAULT_TEMPERATURE, DEFAULT_TOP_P,
    };
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
            assert_eq!(settings.model, DEFAULT_MODEL);
            assert_eq!(settings.endpoint, DEFAULT_ENDPOINT);
            assert_eq!(settings.temperature, DEFAULT_TEMPERATURE);
            assert_eq!(settings.top_p, DEFAULT_TOP_P);
        });
    }

    #[test]
    fn save_settings_round_trips_through_the_settings_file() {
        with_clean_settings_file(|path| {
            let settings = Settings {
                api_key: "secret".to_string(),
                model: "gpt-4.1-mini".to_string(),
                endpoint: "https://example.test".to_string(),
                temperature: 0.25,
                top_p: 0.9,
            };

            save_settings_to_file(&settings).expect("settings should save");

            let raw = fs::read_to_string(path).expect("settings file should exist");
            let loaded = load_settings_from_file();

            assert!(raw.contains("gpt-4.1-mini"));
            assert_eq!(loaded.api_key, "secret");
            assert_eq!(loaded.model, "gpt-4.1-mini");
            assert_eq!(loaded.endpoint, "https://example.test");
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
  "endpoint": "https://example.test"
}"#,
            )
            .expect("partial settings file should be written");

            let loaded = load_settings_from_file();

            assert_eq!(loaded.api_key, "partial");
            assert_eq!(loaded.model, "model-x");
            assert_eq!(loaded.endpoint, "https://example.test");
            assert_eq!(loaded.temperature, DEFAULT_TEMPERATURE);
            assert_eq!(loaded.top_p, DEFAULT_TOP_P);
        });
    }

    #[test]
    fn strip_endpoint_suffix_migrates_old_format() {
        assert_eq!(
            strip_endpoint_suffix("https://api.openai.com/v1/chat/completions"),
            "https://api.openai.com/v1"
        );
        assert_eq!(
            strip_endpoint_suffix("https://api.openai.com/v1/chat/completions/"),
            "https://api.openai.com/v1"
        );
        assert_eq!(
            strip_endpoint_suffix("https://api.openai.com/v1"),
            "https://api.openai.com/v1"
        );
        assert_eq!(
            strip_endpoint_suffix("https://api.openai.com/v1/"),
            "https://api.openai.com/v1"
        );
    }
}
