use tauri::State;

use crate::state::AppState;
use crate::types::Settings;

#[tauri::command]
pub fn update_settings(state: State<'_, AppState>, settings: Settings) -> Result<(), String> {
    *state.api_key.lock().map_err(|e| e.to_string())? = settings.api_key;
    *state.model.lock().map_err(|e| e.to_string())? = settings.model;
    *state.endpoint.lock().map_err(|e| e.to_string())? = settings.endpoint;
    Ok(())
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    Ok(Settings {
        api_key: state.api_key.lock().map_err(|e| e.to_string())?.clone(),
        model: state.model.lock().map_err(|e| e.to_string())?.clone(),
        endpoint: state.endpoint.lock().map_err(|e| e.to_string())?.clone(),
    })
}
