use std::fs;
use std::path::Path;

use crate::types::ContextFile;

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

/// List all `.md` and `.txt` files in a character's `context/` directory
/// and return their names and contents.
#[tauri::command]
pub fn list_context_files(character_dir: String) -> Result<Vec<ContextFile>, String> {
    validate_path(&character_dir)?;
    let context_dir = Path::new(&character_dir).join("context");

    if !context_dir.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    let entries = fs::read_dir(&context_dir)
        .map_err(|e| format!("Failed to read context dir: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        // Only include .txt and .md files (non-hidden)
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if ext != "txt" && ext != "md" {
            continue;
        }

        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        // Skip hidden files (starting with '.')
        if file_name.starts_with('.') {
            continue;
        }

        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read '{}': {}", path.display(), e))?;

        files.push(ContextFile {
            name: file_name,
            content,
        });
    }

    // Sort by name for deterministic ordering
    files.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(files)
}
