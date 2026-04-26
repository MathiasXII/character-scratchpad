use crate::commands::settings::normalize_endpoint;
use crate::types::TestConnectionResult;

/// Test the API key + endpoint by sending a minimal chat completion request.
/// Uses a dummy model name — if the server rejects the model but NOT the key,
/// that proves auth passed, so we treat it as success.
/// Only 401 = bad key, connection failure = bad endpoint.
#[tauri::command]
pub async fn test_connection(base_url: String, api_key: String) -> TestConnectionResult {
    let base = normalize_endpoint(&base_url);
    let url = format!("{}/chat/completions", base);

    // Use a dummy model — we don't care if it exists, only whether auth passes
    let request_body = serde_json::json!({
        "model": "__connection_test__",
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 1,
        "stream": false,
    });

    let client = reqwest::Client::new();
    let response = match client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return TestConnectionResult {
                success: false,
                error_type: Some("connection".into()),
                message: Some(format!("Could not connect: {}", e)),
            }
        }
    };

    let status = response.status();

    // 200 = everything works
    if status.is_success() {
        return TestConnectionResult {
            success: true,
            error_type: None,
            message: None,
        };
    }

    let body = response.text().await.unwrap_or_default();
    let error_code = extract_error_code(&body);

    // 401 = bad API key — the one error that means auth failed
    if status.as_u16() == 401 {
        return TestConnectionResult {
            success: false,
            error_type: Some("auth".into()),
            message: Some("Invalid API key".into()),
        };
    }

    // Model-related errors = auth PASSED (server accepted the key, just rejected
    // the dummy model name). This is a success for key validation purposes.
    let is_model_error = error_code == "model_not_found"
        || error_code == "MODEL_NOT_FOUND"
        || error_code == "invalid_model"
        || error_code == "INVALID_MODEL"
        || (status.as_u16() == 404 && body.to_lowercase().contains("model"))
        || (status.as_u16() == 400 && body.to_lowercase().contains("model"));

    if is_model_error {
        return TestConnectionResult {
            success: true,
            error_type: None,
            message: None,
        };
    }

    // 404 without model mention = bad endpoint URL
    if status.as_u16() == 404 {
        return TestConnectionResult {
            success: false,
            error_type: Some("endpoint".into()),
            message: Some("Endpoint not found (404). Check the URL.".into()),
        };
    }

    TestConnectionResult {
        success: false,
        error_type: Some("server".into()),
        message: Some(format!(
            "Server error ({}): {}",
            status,
            truncate(&body, 200)
        )),
    }
}

/// Test a model by sending a minimal chat completion request.
/// Returns structured result so the frontend can highlight the model field on failure.
#[tauri::command]
pub async fn test_model(base_url: String, api_key: String, model: String) -> TestConnectionResult {
    let base = normalize_endpoint(&base_url);
    let url = format!("{}/chat/completions", base);

    let request_body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": "Hi"}],
        "max_tokens": 1,
        "stream": false,
    });

    let client = reqwest::Client::new();
    let response = match client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return TestConnectionResult {
                success: false,
                error_type: Some("connection".into()),
                message: Some(format!("Could not connect: {}", e)),
            }
        }
    };

    let status = response.status();

    if status.is_success() {
        return TestConnectionResult {
            success: true,
            error_type: None,
            message: None,
        };
    }

    let body = response.text().await.unwrap_or_default();
    let error_code = extract_error_code(&body);

    if status.as_u16() == 401 {
        return TestConnectionResult {
            success: false,
            error_type: Some("auth".into()),
            message: Some("Invalid API key".into()),
        };
    }

    // Model not found — 404 with model_not_found body, or explicit invalid_model code
    if status.as_u16() == 404
        || error_code == "model_not_found"
        || error_code == "MODEL_NOT_FOUND"
    {
        return TestConnectionResult {
            success: false,
            error_type: Some("model_not_found".into()),
            message: Some(format!("Model '{}' not found", model)),
        };
    }

    if error_code == "invalid_model" || error_code == "INVALID_MODEL" {
        return TestConnectionResult {
            success: false,
            error_type: Some("model_not_found".into()),
            message: Some(format!("Invalid model: '{}'", model)),
        };
    }

    // Fallback: 400 with "model" in the body likely means bad model name
    if status.as_u16() == 400 && body.to_lowercase().contains("model") {
        return TestConnectionResult {
            success: false,
            error_type: Some("model_not_found".into()),
            message: Some(format!("Invalid model: '{}'", model)),
        };
    }

    TestConnectionResult {
        success: false,
        error_type: Some("server".into()),
        message: Some(format!(
            "Server error ({}): {}",
            status,
            truncate(&body, 200)
        )),
    }
}

/// Extract the error code from an API error response body.
/// Supports OpenAI format (`error.code`) and Venice format (`error_code`).
fn extract_error_code(body: &str) -> String {
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(body) {
        // OpenAI format: { "error": { "code": "model_not_found" } }
        if let Some(code) = parsed
            .get("error")
            .and_then(|e| e.get("code"))
            .and_then(|c| c.as_str())
        {
            return code.to_string();
        }
        // Venice format: { "error_code": "MODEL_NOT_FOUND" }
        if let Some(code) = parsed.get("error_code").and_then(|c| c.as_str()) {
            return code.to_string();
        }
    }
    String::new()
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}...", &s[..max])
    }
}
