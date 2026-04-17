use std::fs;
use std::path::Path;

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
pub fn create_character(work_folder: String, name: String) -> Result<String, String> {
    let char_dir = Path::new(&work_folder).join(&name);

    if char_dir.exists() {
        return Err(format!("Character '{}' already exists", name));
    }

    fs::create_dir_all(&char_dir)
        .map_err(|e| format!("Failed to create character directory: {}", e))?;

    // Create default empty files
    let files = [
        "instructions.md",
        "prompt.md",
        "description.md",
        "first-response.md",
    ];
    for file in &files {
        let path = char_dir.join(file);
        fs::write(&path, "").map_err(|e| format!("Failed to create '{}': {}", file, e))?;
    }

    // Create context directory
    let context_dir = char_dir.join("context");
    fs::create_dir_all(&context_dir)
        .map_err(|e| format!("Failed to create context directory: {}", e))?;

    Ok(char_dir.to_str().unwrap_or_default().to_string())
}
