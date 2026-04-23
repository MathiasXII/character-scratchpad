use std::sync::Mutex;

pub struct AppState {
    pub api_key: Mutex<String>,
    pub model: Mutex<String>,
    pub endpoint: Mutex<String>,
    pub temperature: Mutex<f32>,
    pub top_p: Mutex<f32>,
    pub client: reqwest::Client,
}
