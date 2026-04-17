use std::fs;
use std::ffi::OsStr;
use std::path::Path;

use git2::{IndexAddOption, Signature};

/// Validate that a character name is safe (no path traversal, no separators)
fn validate_character_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Character name cannot be empty".to_string());
    }
    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err(format!("Invalid character name: '{}'", name));
    }
    Ok(())
}

#[tauri::command]
pub fn list_characters(work_folder: String) -> Result<Vec<String>, String> {
    let dir = fs::read_dir(&work_folder)
        .map_err(|e| format!("Failed to read directory '{}': {}", work_folder, e))?;

    let mut names: Vec<String> = dir
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.is_dir() {
                let name = path.file_name()?.to_str()?.to_string();
                // Skip hidden directories (e.g. .git)
                if !name.starts_with('.') {
                    return Some(name);
                }
            }
            None
        })
        .collect();

    names.sort();
    Ok(names)
}

#[tauri::command]
pub fn ensure_character_files(work_folder: String, name: String) -> Result<(), String> {
    validate_character_name(&name)?;

    let char_dir = Path::new(&work_folder).join(&name);

    // Check if character directory exists
    if !char_dir.exists() {
        return Err(format!("Character directory does not exist: {}", char_dir.display()));
    }

    // List of essential files that should exist
    let essential_files = [
        "instructions.txt",
        "system-prompt.txt",
        "description.txt",
        "intro.txt",
    ];

    // Create missing files with empty content
    for file in &essential_files {
        let path = char_dir.join(file);
        if !path.exists() {
            fs::write(&path, "")
                .map_err(|e| format!("Failed to create missing file '{}': {}", file, e))?;
        }
    }

    // Ensure context directory exists
    let context_dir = char_dir.join("context");
    if !context_dir.exists() {
        fs::create_dir_all(&context_dir)
            .map_err(|e| format!("Failed to create context directory: {}", e))?;
    }

    // Ensure git repository exists
    let repo = match git2::Repository::open(&char_dir) {
        Ok(r) => r,
        Err(_) => {
            // No git repo yet — initialize one
            git2::Repository::init(&char_dir).map_err(|e| e.to_string())?
        }
    };

    // If the repo has no commits yet, make an initial commit with all current files
    let needs_initial_commit = repo.is_empty().unwrap_or(true);
    if needs_initial_commit {
        let sig = Signature::now("LLM Chat", "app@localhost").map_err(|e| e.to_string())?;
        let mut index = repo.index().map_err(|e| e.to_string())?;

        index
            .add_all(["."], IndexAddOption::DEFAULT, Some(&mut |path, _| {
                if path
                    .components()
                    .any(|component| component.as_os_str() == OsStr::new(".git"))
                {
                    1
                } else {
                    0
                }
            }))
            .map_err(|e| e.to_string())?;
        index.write().map_err(|e| e.to_string())?;

        let tree_id = index.write_tree().map_err(|e| e.to_string())?;
        let tree = repo.find_tree(tree_id).map_err(|e| e.to_string())?;

        repo.commit(Some("HEAD"), &sig, &sig, "Initial commit", &tree, &[])
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn create_character(work_folder: String, name: String) -> Result<String, String> {
    validate_character_name(&name)?;

    let char_dir = Path::new(&work_folder).join(&name);

    if char_dir.exists() {
        return Err(format!("Character '{}' already exists", name));
    }

    fs::create_dir_all(&char_dir)
        .map_err(|e| format!("Failed to create character directory: {}", e))?;

    // Delegate file/git initialization to ensure_character_files
    ensure_character_files(work_folder, name)?;

    char_dir
        .to_str()
        .map(|path| path.to_string())
        .ok_or_else(|| "Failed to convert character path to string".to_string())
}
