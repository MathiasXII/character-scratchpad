use crate::commands::settings::normalize_endpoint;

#[tauri::command]
pub async fn fetch_models(base_url: String, api_key: String) -> Result<Vec<String>, String> {
    let base = normalize_endpoint(&base_url);
    let url = format!("{}/models", base);

    let client = reqwest::Client::new();
    let response = match client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
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
