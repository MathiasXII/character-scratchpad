use std::fs;
use std::path::Path;

use lopdf::Document;

use crate::commands::line_endings::normalize_line_endings;
use crate::commands::validation::{
    validate_filename, validate_path, validate_within_workspace,
    ALLOWED_CONTEXT_EXTENSIONS, WRITABLE_CONTEXT_EXTENSIONS,
};
use crate::types::{AppError, ContextFile};

#[tauri::command]
pub fn load_file(path: String, work_folder: String) -> Result<String, AppError> {
    validate_path(&path).map_err(AppError::ValidationError)?;
    validate_within_workspace(&path, &work_folder).map_err(AppError::PathTraversalError)?;

    let content = fs::read_to_string(&path).map_err(|e| {
        AppError::IoError(format!("Failed to read '{}': {}", path, e))
    })?;
    // Normalize line endings to LF — prevents spurious saves on Windows (CRLF vs LF)
    Ok(normalize_line_endings(&content))
}

#[tauri::command]
pub fn save_file(path: String, content: String, work_folder: String) -> Result<(), AppError> {
    validate_path(&path).map_err(AppError::ValidationError)?;

    // Create parent directories before workspace validation so that
    // canonicalization can resolve the full path when the file is new.
    // This is safe because `validate_path` already rejects traversal
    // components (".." / "."), so the directory structure cannot escape
    // the workspace.
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| {
            AppError::IoError(format!("Failed to create directory '{}': {}", parent.display(), e))
        })?;
    }

    validate_within_workspace(&path, &work_folder).map_err(AppError::PathTraversalError)?;

    // Normalize line endings to LF — prevents CRLF/LF mismatch on Windows
    let normalized = normalize_line_endings(&content);
    fs::write(&path, &normalized).map_err(|e| {
        AppError::IoError(format!("Failed to write '{}': {}", path, e))
    })
}

/// List all `.md` and `.txt` files in a character's `context/` directory
/// and return their names and contents.
#[tauri::command]
pub fn list_context_files(
    character_dir: String,
    work_folder: String,
) -> Result<Vec<ContextFile>, AppError> {
    validate_path(&character_dir).map_err(AppError::ValidationError)?;
    validate_within_workspace(&character_dir, &work_folder)
        .map_err(AppError::PathTraversalError)?;

    let context_dir = Path::new(&character_dir).join("context");

    if !context_dir.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    let entries = fs::read_dir(&context_dir).map_err(|e| {
        AppError::IoError(format!("Failed to read context dir: {}", e))
    })?;

    for entry in entries {
        let entry = entry.map_err(|e| AppError::IoError(format!("Failed to read entry: {}", e)))?;
        let path = entry.path();

        // Only include allowed extensions (non-hidden)
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if !ALLOWED_CONTEXT_EXTENSIONS.contains(&ext) {
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
            let content = fs::read_to_string(&path).map_err(|e| {
                AppError::IoError(format!("Failed to read '{}': {}", path.display(), e))
            })?;
            // Normalize line endings to LF for consistency
            let content = normalize_line_endings(&content);
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
pub fn create_context_file(
    character_dir: String,
    filename: String,
    work_folder: String,
) -> Result<String, AppError> {
    validate_path(&character_dir).map_err(AppError::ValidationError)?;
    validate_within_workspace(&character_dir, &work_folder)
        .map_err(AppError::PathTraversalError)?;
    validate_filename(&filename).map_err(AppError::ValidationError)?;

    // Auto-append .txt extension if no recognized extension (.txt, .md)
    let ext = Path::new(&filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let filename_with_ext = if !WRITABLE_CONTEXT_EXTENSIONS.contains(&ext) {
        format!("{}.txt", filename)
    } else {
        filename
    };

    let context_dir = Path::new(&character_dir).join("context");
    let file_path = context_dir.join(&filename_with_ext);

    // Ensure context directory exists
    fs::create_dir_all(&context_dir).map_err(|e| {
        AppError::IoError(format!("Failed to create context directory: {}", e))
    })?;

    // Check if file already exists
    if file_path.exists() {
        return Err(AppError::ValidationError(format!(
            "'{}' already exists",
            filename_with_ext
        )));
    }

    // Write empty file
    fs::write(&file_path, "").map_err(|e| {
        AppError::IoError(format!(
            "Failed to create file '{}': {}",
            file_path.display(),
            e
        ))
    })?;

    file_path.to_str().map(|p| p.to_string()).ok_or_else(|| {
        AppError::IoError("Failed to convert path to string".to_string())
    })
}

/// Delete a context file from a character's context directory.
#[tauri::command]
pub fn delete_context_file(
    character_dir: String,
    filename: String,
    work_folder: String,
) -> Result<(), AppError> {
    validate_path(&character_dir).map_err(AppError::ValidationError)?;
    validate_within_workspace(&character_dir, &work_folder)
        .map_err(AppError::PathTraversalError)?;
    validate_filename(&filename).map_err(AppError::ValidationError)?;

    let context_dir = Path::new(&character_dir).join("context");
    let file_path = context_dir.join(&filename);

    // Verify the resolved path is inside the context directory (path traversal protection)
    let canonical_context = context_dir.canonicalize().map_err(|e| {
        AppError::IoError(format!("Failed to resolve context directory: {}", e))
    })?;
    let canonical_file = file_path.canonicalize().map_err(|_| {
        AppError::IoError(format!("File not found: {}", filename))
    })?;

    if !canonical_file.starts_with(&canonical_context) {
        return Err(AppError::PathTraversalError(
            "Invalid path: file is not inside context directory".to_string(),
        ));
    }

    // Delete the file
    fs::remove_file(&canonical_file).map_err(|e| {
        AppError::IoError(format!("Failed to delete '{}': {}", filename, e))
    })
}

/// Copy an external file into a character's context/ directory.
/// Returns the filename used (which may differ from the original if a collision occurred).
#[tauri::command]
pub fn copy_file_to_context(
    source_path: String,
    character_dir: String,
    work_folder: String,
) -> Result<String, AppError> {
    validate_path(&source_path).map_err(AppError::ValidationError)?;
    validate_path(&character_dir).map_err(AppError::ValidationError)?;
    validate_within_workspace(&character_dir, &work_folder)
        .map_err(AppError::PathTraversalError)?;

    let source = Path::new(&source_path);
    if !source.exists() {
        return Err(AppError::IoError(format!(
            "Source file not found: {}",
            source_path
        )));
    }
    if !source.is_file() {
        return Err(AppError::ValidationError(format!(
            "Source is not a file: {}",
            source_path
        )));
    }

    let filename = source
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::ValidationError("Invalid source filename".to_string()))?
        .to_string();

    // Validate the filename (reject hidden files, path separators, etc.)
    validate_filename(&filename).map_err(AppError::ValidationError)?;

    // Only allow certain file extensions
    let ext = Path::new(&filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if !ALLOWED_CONTEXT_EXTENSIONS.contains(&ext.as_str()) {
        return Err(AppError::ValidationError(format!(
            "File type '.{}' is not supported. Allowed types: {}",
            ext,
            ALLOWED_CONTEXT_EXTENSIONS.join(", ")
        )));
    }

    let context_dir = Path::new(&character_dir).join("context");

    // Ensure context directory exists
    fs::create_dir_all(&context_dir).map_err(|e| {
        AppError::IoError(format!("Failed to create context directory: {}", e))
    })?;

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
    fs::copy(source, &target_path).map_err(|e| AppError::IoError(format!("Failed to copy file: {}", e)))?;

    Ok(target_filename)
}

/// Maximum PDF file size in bytes (50 MB)
const MAX_PDF_SIZE: u64 = 50 * 1024 * 1024;

/// Extract text content from a PDF file using lopdf.
fn extract_pdf_text(path: &Path) -> Result<String, String> {
    // Check file size before loading into memory
    let metadata = fs::metadata(path)
        .map_err(|e| format!("Failed to read PDF metadata '{}': {}", path.display(), e))?;
    if metadata.len() > MAX_PDF_SIZE {
        return Err(format!(
            "PDF file is too large ({} MB, max 50 MB)",
            metadata.len() / (1024 * 1024)
        ));
    }

    let bytes =
        fs::read(path).map_err(|e| format!("Failed to read PDF '{}': {}", path.display(), e))?;
    let doc = Document::load_mem(&bytes).map_err(|e| format!("{}", e))?;
    let pages: Vec<u32> = doc.get_pages().keys().cloned().collect();
    doc.extract_text(&pages).map_err(|e| format!("{}", e))
}

#[cfg(test)]
mod tests {
    use crate::commands::validation::{validate_filename, validate_path};

    #[test]
    fn test_validate_path_rejects_parent_dir() {
        assert!(validate_path("../etc/passwd").is_err());
    }

    #[test]
    fn test_validate_path_rejects_cur_dir() {
        assert!(validate_path("./foo").is_err());
    }

    #[test]
    fn test_validate_path_allows_normal() {
        assert!(validate_path("some/path/file.txt").is_ok());
    }

    #[test]
    fn test_validate_filename_rejects_empty() {
        assert!(validate_filename("").is_err());
    }

    #[test]
    fn test_validate_filename_rejects_hidden() {
        assert!(validate_filename(".hidden").is_err());
    }

    #[test]
    fn test_validate_filename_rejects_path_separators() {
        assert!(validate_filename("foo/bar").is_err());
        assert!(validate_filename("foo\\bar").is_err());
    }

    #[test]
    fn test_validate_filename_rejects_double_dot() {
        assert!(validate_filename("foo..bar").is_err());
    }

    #[test]
    fn test_validate_filename_allows_normal() {
        assert!(validate_filename("notes.md").is_ok());
    }
}
