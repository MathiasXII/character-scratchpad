use std::fs;
use std::path::Path;

use crate::types::ContextFile;
use lopdf::Document;

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

/// Validate a context filename: reject empty, path separators, traversal, and hidden files.
fn validate_filename(filename: &str) -> Result<(), String> {
    if filename.is_empty() {
        return Err("Filename cannot be empty".to_string());
    }
    if filename.starts_with('.') {
        return Err(format!("Invalid filename (cannot start with '.'): '{}'", filename));
    }
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err(format!("Invalid filename: '{}'", filename));
    }
    Ok(())
}

#[tauri::command]
pub fn load_file(path: String) -> Result<String, String> {
    validate_path(&path)?;
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read '{}': {}", path, e))?;
    // Normalize line endings to LF — prevents spurious saves on Windows (CRLF vs LF)
    Ok(content.replace("\r\n", "\n").replace('\r', "\n"))
}

#[tauri::command]
pub fn save_file(path: String, content: String) -> Result<(), String> {
    validate_path(&path)?;
    // Create parent directories if they don't exist
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory '{}': {}", parent.display(), e))?;
    }
    // Normalize line endings to LF — prevents CRLF/LF mismatch on Windows
    let normalized = content.replace("\r\n", "\n").replace('\r', "\n");
    fs::write(&path, &normalized).map_err(|e| format!("Failed to write '{}': {}", path, e))
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

        // Only include .txt, .md, and .pdf files (non-hidden)
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if ext != "txt" && ext != "md" && ext != "pdf" {
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

        let (content, is_read_only) = if ext == "pdf" {
            // Extract text from PDF files
            let content = match extract_pdf_text(&path) {
                Ok(text) => text,
                Err(e) => format!("[PDF text extraction failed: {}]", e),
            };
            (content, true)
        } else {
            let content = fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read '{}': {}", path.display(), e))?;
            // Normalize line endings to LF for consistency
            let content = content.replace("\r\n", "\n").replace('\r', "\n");
            (content, false)
        };

        files.push(ContextFile {
            name: file_name,
            content,
            is_read_only,
        });
    }

    // Sort by name for deterministic ordering
    files.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(files)
}

/// Create a new empty context file in a character's context directory.
#[tauri::command]
pub fn create_context_file(character_dir: String, filename: String) -> Result<String, String> {
    validate_filename(&filename)?;

    // Auto-append .txt extension if no .txt or .md extension
    let ext = Path::new(&filename).extension().and_then(|e| e.to_str()).unwrap_or("");
    let filename_with_ext = if ext != "txt" && ext != "md" {
        format!("{}.txt", filename)
    } else {
        filename
    };

    let context_dir = Path::new(&character_dir).join("context");
    let file_path = context_dir.join(&filename_with_ext);

    // Ensure context directory exists
    fs::create_dir_all(&context_dir)
        .map_err(|e| format!("Failed to create context directory: {}", e))?;

    // Check if file already exists
    if file_path.exists() {
        return Err(format!("'{}' already exists", filename_with_ext));
    }

    // Write empty file
    fs::write(&file_path, "")
        .map_err(|e| format!("Failed to create file '{}': {}", file_path.display(), e))?;

    file_path
        .to_str()
        .map(|p| p.to_string())
        .ok_or_else(|| "Failed to convert path to string".to_string())
}

/// Delete a context file from a character's context directory.
#[tauri::command]
pub fn delete_context_file(character_dir: String, filename: String) -> Result<(), String> {
    validate_filename(&filename)?;

    let context_dir = Path::new(&character_dir).join("context");
    let file_path = context_dir.join(&filename);

    // Verify the resolved path is inside the context directory (path traversal protection)
    let canonical_context = context_dir
        .canonicalize()
        .map_err(|e| format!("Failed to resolve context directory: {}", e))?;
    let canonical_file = file_path
        .canonicalize()
        .map_err(|_| format!("File not found: {}", filename))?;

    if !canonical_file.starts_with(&canonical_context) {
        return Err("Invalid path: file is not inside context directory".to_string());
    }

    // Delete the file
    fs::remove_file(&canonical_file)
        .map_err(|e| format!("Failed to delete '{}': {}", filename, e))
}

/// Copy an external file into a character's context/ directory.
/// Returns the filename used (which may differ from the original if a collision occurred).
#[tauri::command]
pub fn copy_file_to_context(source_path: String, character_dir: String) -> Result<String, String> {
    validate_path(&source_path)?;
    validate_path(&character_dir)?;

    let source = Path::new(&source_path);
    if !source.exists() {
        return Err(format!("Source file not found: {}", source_path));
    }
    if !source.is_file() {
        return Err(format!("Source is not a file: {}", source_path));
    }

    let filename = source
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid source filename".to_string())?
        .to_string();

    // Validate the filename (reject hidden files, path separators, etc.)
    validate_filename(&filename)?;

    // Only allow certain file extensions
    let ext = Path::new(&filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let allowed_extensions = ["txt", "md", "pdf"];
    if !allowed_extensions.contains(&ext.as_str()) {
        return Err(format!(
            "File type '.{}' is not supported. Allowed types: {}",
            ext,
            allowed_extensions.join(", ")
        ));
    }

    let context_dir = Path::new(&character_dir).join("context");

    // Ensure context directory exists
    fs::create_dir_all(&context_dir)
        .map_err(|e| format!("Failed to create context directory: {}", e))?;

    // Resolve collisions by appending a counter before the extension
    let mut target_filename = filename.clone();
    let mut counter = 1;
    let stem = Path::new(&filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("file")
        .to_string();
    let ext_with_dot = if ext.is_empty() {
        String::new()
    } else {
        format!(".{}", ext)
    };

    while context_dir.join(&target_filename).exists() {
        target_filename = format!("{}-{}{}", stem, counter, ext_with_dot);
        counter += 1;
    }

    let target_path = context_dir.join(&target_filename);
    fs::copy(source, &target_path)
        .map_err(|e| format!("Failed to copy file: {}", e))?;

    Ok(target_filename)
}

/// Extract text content from a PDF file using lopdf.
fn extract_pdf_text(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("Failed to read PDF '{}': {}", path.display(), e))?;
    let doc = Document::load_mem(&bytes).map_err(|e| format!("{}", e))?;
    let pages: Vec<u32> = doc.get_pages().keys().cloned().collect();
    doc.extract_text(&pages).map_err(|e| format!("{}", e))
}
