mod common;

use std::fs;

use common::TempTestDir;
use character_scratch_pad_lib::commands::files::{
    copy_file_to_context, delete_context_file, list_context_files, load_file, save_file,
};

#[test]
fn save_and_load_file_normalize_line_endings_and_create_parents() {
    let temp = TempTestDir::new("files-save-load");
    let file_path = temp.join("nested/notes.txt");
    let file_path_str = file_path.to_string_lossy().to_string();

    save_file(file_path_str.clone(), "one\r\ntwo\rthree".to_string())
        .expect("save_file should succeed");

    let raw = fs::read_to_string(&file_path).expect("saved file should be readable");
    let loaded = load_file(file_path_str).expect("load_file should succeed");

    assert_eq!(raw, "one\ntwo\nthree");
    assert_eq!(loaded, "one\ntwo\nthree");
}

#[test]
fn list_context_files_handles_missing_dirs_and_skips_hidden_or_unsupported_files() {
    let temp = TempTestDir::new("files-list-context");
    let character_dir = temp.join("hero");
    fs::create_dir_all(&character_dir).expect("character dir should exist");

    let empty = list_context_files(character_dir.to_string_lossy().to_string())
        .expect("missing context dir should not error");
    assert!(empty.is_empty());

    let context_dir = character_dir.join("context");
    fs::create_dir_all(&context_dir).expect("context dir should exist");
    fs::write(context_dir.join("zeta.txt"), "zeta\r\nline").expect("zeta file should exist");
    fs::write(context_dir.join("alpha.md"), "alpha").expect("alpha file should exist");
    fs::write(context_dir.join(".hidden.md"), "hidden").expect("hidden file should exist");
    fs::write(context_dir.join("ignore.json"), "{}").expect("json file should exist");

    let files = list_context_files(character_dir.to_string_lossy().to_string())
        .expect("context files should list");

    let names: Vec<String> = files.iter().map(|file| file.name.clone()).collect();
    assert_eq!(names, vec!["alpha.md".to_string(), "zeta.txt".to_string()]);
    assert_eq!(files[1].content, "zeta\nline");
}

#[test]
fn delete_context_file_reports_missing_files_and_copy_rejects_invalid_sources() {
    let temp = TempTestDir::new("files-delete-copy");
    let character_dir = temp.join("hero");
    fs::create_dir_all(character_dir.join("context")).expect("context dir should exist");

    let delete_error = delete_context_file(
        character_dir.to_string_lossy().to_string(),
        "missing.txt".to_string(),
    )
    .expect_err("missing context file should fail");
    assert!(delete_error.contains("File not found"));

    let missing_source_error = copy_file_to_context(
        temp.join("missing.md").to_string_lossy().to_string(),
        character_dir.to_string_lossy().to_string(),
    )
    .expect_err("missing source file should fail");
    assert!(missing_source_error.contains("Source file not found"));

    let source_dir = temp.join("directory-source");
    fs::create_dir_all(&source_dir).expect("source dir should exist");
    let directory_error = copy_file_to_context(
        source_dir.to_string_lossy().to_string(),
        character_dir.to_string_lossy().to_string(),
    )
    .expect_err("directory source should fail");
    assert!(directory_error.contains("Source is not a file"));
}
