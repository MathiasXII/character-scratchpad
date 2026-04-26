/// Normalize text line endings to LF.
///
/// Preserves current behavior by converting both CRLF and lone CR to LF.
pub fn normalize_line_endings(content: &str) -> String {
    content.replace("\r\n", "\n").replace('\r', "\n")
}
