use serde::{Deserialize, Serialize};

fn default_temperature() -> f32 {
    0.7
}

fn default_top_p() -> f32 {
    1.0
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(rename = "isFile", skip_serializing_if = "Option::is_none")]
    pub is_file: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub api_key: String,
    pub model: String,
    pub endpoint: String,
    #[serde(default = "default_temperature")]
    pub temperature: f32,
    #[serde(default = "default_top_p")]
    pub top_p: f32,
}

/// A single file from a character's context/ directory.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContextFile {
    pub name: String,
    pub content: String,
}
