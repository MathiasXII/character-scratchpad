use std::path::Path;

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
