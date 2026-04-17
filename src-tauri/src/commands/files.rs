use std::fs;
use std::path::Path;

/// Reject paths that contain traversal components (e.g. ".." or "." segments).
fn validate_path(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    for component in p.components() {
        match component {
            std::path::Component::ParentDir => {
                return Err(format!("Invalid path (contains '..'): {}", path));
            }
            std::path::Component::CurDir => {
                return Err(format!("Invalid path (contains '.'): {}", path));
            }
            _ => {}
        }
    }
    Ok(())
}

#[tauri::command]
pub fn load_file(path: String) -> Result<String, String> {
    validate_path(&path)?;
    fs::read_to_string(&path).map_err(|e| format!("Failed to read '{}': {}", path, e))
}

#[tauri::command]
pub fn save_file(path: String, content: String) -> Result<(), String> {
    validate_path(&path)?;
    // Create parent directories if they don't exist
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory '{}': {}", parent.display(), e))?;
    }
    fs::write(&path, &content).map_err(|e| format!("Failed to write '{}': {}", path, e))
}
