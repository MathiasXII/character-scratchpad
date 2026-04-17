use futures_util::StreamExt;
use tauri::{AppHandle, Manager, State};

use crate::state::AppState;
use crate::types::{ChatCompletionRequest, ChatMessage};

#[tauri::command]
pub async fn send_message_stream(
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
            buffer.drain(..=pos);

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
