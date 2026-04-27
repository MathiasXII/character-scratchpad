use std::fs;
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use character_scratch_pad_lib::commands::characters::create_character;
use character_scratch_pad_lib::commands::files::save_file;
use character_scratch_pad_lib::commands::git::{git_commit, git_commit_amend, git_diff_last, git_get_head_content, git_is_dirty, git_list_head_folder, git_log, git_revert};

struct TempWorkspace {
    path: PathBuf,
}

impl TempWorkspace {
    fn new(prefix: &str) -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock before UNIX_EPOCH")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("llm-chat-{}-{}-{}", prefix, std::process::id(), unique));
        fs::create_dir_all(&path).expect("failed to create temp workspace");
        Self { path }
    }

    fn path(&self) -> &PathBuf {
        &self.path
    }
}

impl Drop for TempWorkspace {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

#[test]
fn git_workflow_round_trip() {
    let workspace = TempWorkspace::new("git-workflow");
    let work_folder = workspace.path().to_string_lossy().to_string();
    let character_name = "git-character".to_string();

    let character_dir = create_character(work_folder.clone(), character_name)
        .expect("character should be created");
    let instructions_path = PathBuf::from(&character_dir).join("instructions.txt");
    let instructions_path_str = instructions_path.to_string_lossy().to_string();

    assert!(!git_is_dirty(character_dir.clone()).expect("initial repo should be clean"));

    save_file(instructions_path_str.clone(), "first revision".to_string())
        .expect("save should succeed");
    assert!(git_is_dirty(character_dir.clone()).expect("repo should be dirty after edit"));

    git_commit(character_dir.clone(), "first commit".to_string()).expect("commit should succeed");
    assert!(!git_is_dirty(character_dir.clone()).expect("repo should be clean after commit"));

    let commits_after_first = git_log(character_dir.clone()).expect("git_log should succeed");
    assert!(!commits_after_first.is_empty());

    thread::sleep(Duration::from_secs(1));
    save_file(instructions_path_str.clone(), "second revision".to_string())
        .expect("second save should succeed");
    git_commit(character_dir.clone(), "second commit".to_string()).expect("second commit should succeed");

    let commits_after_second = git_log(character_dir.clone()).expect("git_log should succeed");
    assert!(commits_after_second.len() >= 2);

    let diff = git_diff_last(character_dir.clone()).expect("git_diff_last should succeed");
    assert!(!diff.trim().is_empty());

    let first_commit_id = commits_after_second
        .iter()
        .find(|commit| commit.message == "first commit")
        .expect("expected first commit to be present")
        .id
        .clone();

    git_revert(character_dir.clone(), first_commit_id).expect("git_revert should succeed");

    let reverted = fs::read_to_string(&instructions_path).expect("file should exist after revert");
    assert_eq!(reverted, "first revision");

    git_commit_amend(character_dir.clone(), "renamed commit".to_string())
        .expect("git_commit_amend should succeed");

    let head_content = git_get_head_content(character_dir.clone(), "instructions.txt".to_string())
        .expect("git_get_head_content should succeed");
    assert_eq!(head_content, Some("first revision".to_string()));

    let context_entries = git_list_head_folder(character_dir, "context".to_string())
        .expect("git_list_head_folder should succeed");
    assert!(context_entries.is_empty());
}
