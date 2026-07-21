use std::path::{Path, PathBuf};

/// File extensions allowed for reading from context directories
pub(crate) const ALLOWED_CONTEXT_EXTENSIONS: &[&str] = &["txt", "md", "pdf"];

/// File extensions allowed for creating/writing in context directories (excludes read-only formats like PDF)
pub(crate) const WRITABLE_CONTEXT_EXTENSIONS: &[&str] = &["txt", "md"];

/// Reject paths that contain traversal components (e.g. ".." or "." segments).
pub(crate) fn validate_path(path: &str) -> Result<(), String> {
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

/// Validate that a path falls within the specified workspace directory.
///
/// Canonicalizes both paths and verifies the target is a subdirectory or file
/// within the workspace. Returns the canonicalized target path on success.
///
/// # Security
/// This prevents path traversal attacks by ensuring commands can only access
/// files within the user's chosen workspace folder.
pub(crate) fn validate_within_workspace(path: &str, workspace: &str) -> Result<PathBuf, String> {
    let workspace = Path::new(workspace).canonicalize().map_err(|e| {
        format!("Invalid workspace path '{}': {}", workspace, e)
    })?;

    // The file may not exist yet (e.g. save_file creates a new file), so we
    // validate the parent directory instead.
    let target = Path::new(path);
    let canonical_target = if target.exists() {
        target.canonicalize().map_err(|e| {
            format!("Path not found '{}': {}", path, e)
        })?
    } else {
        let parent = target
            .parent()
            .ok_or_else(|| "Path has no parent directory".to_string())?;
        let canonical_parent = parent.canonicalize().map_err(|_e| {
            format!("Parent directory does not exist: '{}'", parent.display())
        })?;
        // Rebuild full path: canonical parent + filename
        canonical_parent.join(
            target
                .file_name()
                .ok_or_else(|| "Path has no filename".to_string())?,
        )
    };

    if !canonical_target.starts_with(&workspace) {
        return Err(format!(
            "Path is outside the workspace: {}",
            path
        ));
    }

    Ok(canonical_target)
}

/// Validate a bare filename: reject empty, path separators, traversal, and hidden names.
///
/// Used for context filenames and character names (which become directory names).
pub(crate) fn validate_filename(filename: &str) -> Result<(), String> {
    if filename.is_empty() {
        return Err("Filename cannot be empty".to_string());
    }
    if filename.starts_with('.') {
        return Err(format!(
            "Invalid filename (cannot start with '.'): '{}'",
            filename
        ));
    }
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err(format!("Invalid filename: '{}'", filename));
    }
    Ok(())
}
