use std::sync::Mutex;

pub struct AppState {
    pub api_key: Mutex<String>,
    pub model: Mutex<String>,
    pub endpoint: Mutex<String>,
    pub client: reqwest::Client,
}
