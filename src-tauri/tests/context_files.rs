mod common;

use std::fs;
use std::path::PathBuf;

use llm_chat_lib::commands::files::{copy_file_to_context, create_context_file, delete_context_file, list_context_files};

use common::TempTestDir;

#[test]
fn context_file_workflow() {
    let workspace = TempTestDir::new("context-files");
    let character_dir = workspace.path().join("context-character");
    fs::create_dir_all(character_dir.join("context")).expect("failed to create character structure");

    let created = create_context_file(character_dir.to_string_lossy().to_string(), "notes".to_string())
        .expect("context file should be created");
    assert!(PathBuf::from(&created).exists());

    let duplicate = create_context_file(character_dir.to_string_lossy().to_string(), "notes".to_string())
        .expect_err("duplicate context file should fail");
    assert!(duplicate.contains("already exists"));

    let auto_text = create_context_file(character_dir.to_string_lossy().to_string(), "outline".to_string())
        .expect("file without extension should default to .txt");
    assert!(auto_text.ends_with("outline.txt"));

    let context_files = list_context_files(character_dir.to_string_lossy().to_string())
        .expect("context files should list");
    let names: Vec<String> = context_files.iter().map(|file| file.name.clone()).collect();
    assert!(names.contains(&"notes.txt".to_string()));
    assert!(names.contains(&"outline.txt".to_string()));

    delete_context_file(character_dir.to_string_lossy().to_string(), "notes.txt".to_string())
        .expect("delete_context_file should succeed");
    assert!(!character_dir.join("context/notes.txt").exists());

    let external_file = workspace.path().join("reference.md");
    fs::write(&external_file, "reference content").expect("failed to create external file");

    let copied_name = copy_file_to_context(external_file.to_string_lossy().to_string(), character_dir.to_string_lossy().to_string())
        .expect("copy_file_to_context should succeed");
    assert_eq!(copied_name, "reference.md");
    assert!(character_dir.join("context/reference.md").exists());

    let copied_name_again = copy_file_to_context(external_file.to_string_lossy().to_string(), character_dir.to_string_lossy().to_string())
        .expect("copy collision should be resolved");
    assert_eq!(copied_name_again, "reference-1.md");
    assert!(character_dir.join("context/reference-1.md").exists());

    let unsupported_file = workspace.path().join("data.json");
    fs::write(&unsupported_file, "{}").expect("failed to create unsupported file");
    let unsupported_err = copy_file_to_context(unsupported_file.to_string_lossy().to_string(), character_dir.to_string_lossy().to_string())
        .expect_err("unsupported file type should fail");
    assert!(unsupported_err.contains("not supported"));
}
