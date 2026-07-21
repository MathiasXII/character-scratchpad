use serde::{Deserialize, Serialize};

// --- Custom Error Definition ---

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    IoError(String),
    ValidationError(String),
    PathTraversalError(String),
    PdfExtractionError(String),
}

impl From<String> for AppError {
    fn from(msg: String) -> Self {
        AppError::IoError(msg)
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::IoError(msg) => write!(f, "I/O Error: {}", msg),
            AppError::ValidationError(msg) => write!(f, "Validation Error: {}", msg),
            AppError::PathTraversalError(msg) => write!(f, "Path Traversal Error: {}", msg),
            AppError::PdfExtractionError(msg) => write!(f, "PDF Extraction Error: {}", msg),
        }
    }
}

// Implement From traits for easy error conversion from standard library errors
impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::IoError(err.to_string())
    }
}

// --- Constants and Default Functions ---

pub const DEFAULT_MODEL: &str = "zai-org-glm-4.6";
pub const DEFAULT_ENDPOINT: &str = "https://api.venice.ai/api/v1";
pub const DEFAULT_TEMPERATURE: f32 = 0.7;
pub const DEFAULT_TOP_P: f32 = 1.0;

fn default_temperature() -> f32 {
    DEFAULT_TEMPERATURE
}

fn default_top_p() -> f32 {
    DEFAULT_TOP_P
}

// --- Data Structures ---

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

#[derive(Debug, Serialize, Clone)]
pub struct TestConnectionResult {
    pub success: bool,
    /// "connection" | "auth" | "endpoint" | "model_not_found" | "server"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// A single file from a character's context/ directory.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContextFile {
    pub name: String,
    pub content: String,
    #[serde(default)]
    #[serde(rename = "isReadOnly")]
    pub is_read_only: bool,
}