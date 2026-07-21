mod common;

use std::path::PathBuf;

use character_scratch_pad_lib::commands::characters::{create_character, ensure_character_files, list_characters};
use character_scratch_pad_lib::commands::files::{load_file, save_file};

use common::TempTestDir;

#[test]
fn character_lifecycle_workflow() {
    let workspace = TempTestDir::new("character-workflow");
    let work_folder = workspace.path().to_string_lossy().to_string();
    let character_name = "test-character".to_string();

    let character_dir = create_character(work_folder.clone(), character_name.clone())
        .expect("character should be created");
    let character_path = PathBuf::from(&character_dir);

    for file_name in [
        "instructions.txt",
        "system-prompt.txt",
        "description.txt",
        "intro.txt",
    ] {
        assert!(character_path.join(file_name).exists(), "missing {}", file_name);
    }
    assert!(character_path.join("context").is_dir());

    let characters = list_characters(work_folder.clone()).expect("character list should load");
    assert!(characters.iter().any(|name| name == &character_name));

    ensure_character_files(work_folder.clone(), character_name.clone())
        .expect("ensure_character_files should be idempotent");

    let duplicate = create_character(work_folder.clone(), character_name.clone())
        .expect_err("creating the same character should fail");
    assert!(duplicate.contains("already exists"));

    let instructions_path = character_path.join("instructions.txt");
    let instructions_path_str = instructions_path.to_string_lossy().to_string();
    let content = "Be helpful, concise, and consistent.".to_string();
    save_file(instructions_path_str.clone(), content.clone(), work_folder.clone()).expect("save_file should succeed");

    let loaded = load_file(instructions_path_str.clone(), work_folder.clone()).expect("load_file should succeed");
    assert_eq!(loaded, content);
}
