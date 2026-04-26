use tauri::State;

use crate::commands::http::{models_url, with_auth};
use crate::state::AppState;

#[tauri::command]
pub async fn fetch_models(
    state: State<'_, AppState>,
    base_url: String,
    api_key: String,
) -> Result<Vec<String>, String> {
    let url = models_url(&base_url);

    let response = match with_auth(state.client.get(&url), &api_key)
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => return Ok(vec![]),
    };

    if !response.status().is_success() {
        return Ok(vec![]);
    }

    let body: serde_json::Value = match response.json().await {
        Ok(v) => v,
        Err(_) => return Ok(vec![]),
    };

    let data = match body.get("data").and_then(|d| d.as_array()) {
        Some(arr) => arr,
        None => return Ok(vec![]),
    };

    let models: Vec<String> = data
        .iter()
        .filter_map(|item| item.get("id").and_then(|id| id.as_str()).map(String::from))
        .collect();

    Ok(models)
}
