//! Shared HTTP request helpers for OpenAI-compatible API calls.
//!
//! Consolidates URL construction, auth header assembly, and common
//! request-builder patterns that are repeated across stream_chat,
//! test_connection, test_model, fetch_models, and generate_checkpoint_name.

/// Build the chat completions URL from a base endpoint.
/// Trims any trailing slash before appending `/chat/completions`.
pub(crate) fn chat_completions_url(base: &str) -> String {
    format!("{}/chat/completions", base.trim_end_matches('/'))
}

/// Build the models URL from a base endpoint.
/// Trims any trailing slash before appending `/models`.
pub(crate) fn models_url(base: &str) -> String {
    format!("{}/models", base.trim_end_matches('/'))
}

/// Format a Bearer authorization header value.
pub(crate) fn bearer_value(api_key: &str) -> String {
    format!("Bearer {}", api_key)
}

/// Apply Authorization and Content-Type headers to a request builder.
/// Used for POST requests with JSON bodies (chat completions, connection/model tests).
pub(crate) fn with_auth_json(
    builder: reqwest::RequestBuilder,
    api_key: &str,
) -> reqwest::RequestBuilder {
    builder
        .header("Authorization", bearer_value(api_key))
        .header("Content-Type", "application/json")
}

/// Apply Authorization header only to a request builder.
/// Used for GET requests that don't send a JSON body (model listing).
pub(crate) fn with_auth(
    builder: reqwest::RequestBuilder,
    api_key: &str,
) -> reqwest::RequestBuilder {
    builder.header("Authorization", bearer_value(api_key))
}
