use std::ffi::OsStr;

use git2::{IndexAddOption, Oid, ResetType, Signature, Sort};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct CommitEntry {
    id: String,
    message: String,
    timestamp: i64,
}

#[tauri::command]
pub fn git_commit(repo_path: String, message: String) -> Result<String, String> {
    let repo = git2::Repository::open(&repo_path).map_err(|e| e.to_string())?;
    let sig = Signature::now("LLM Chat", "app@localhost").map_err(|e| e.to_string())?;

    let mut index = repo.index().map_err(|e| e.to_string())?;
    index
        .add_all(["."], IndexAddOption::DEFAULT, Some(&mut |path, _| {
            if path.components().any(|component| component.as_os_str() == OsStr::new(".git")) {
                1
            } else {
                0
            }
        }))
        .map_err(|e| e.to_string())?;
    index.write().map_err(|e| e.to_string())?;

    let tree_id = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.to_string())?;

    let parent = repo.head().ok().and_then(|reference| reference.peel_to_commit().ok());
    let parents = parent.iter().collect::<Vec<_>>();

    let commit_id = repo
        .commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)
        .map_err(|e| e.to_string())?;

    Ok(commit_id.to_string())
}

#[tauri::command]
pub fn git_log(repo_path: String) -> Result<Vec<CommitEntry>, String> {
    let repo = git2::Repository::open(&repo_path).map_err(|e| e.to_string())?;
    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;

    revwalk.push_head().map_err(|e| e.to_string())?;
    revwalk.set_sorting(Sort::TIME).map_err(|e| e.to_string())?;

    revwalk
        .take(50)
        .map(|oid| {
            let oid = oid.map_err(|e| e.to_string())?;
            let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;

            Ok(CommitEntry {
                id: commit.id().to_string(),
                message: commit.message().map(str::trim).unwrap_or("").to_string(),
                timestamp: commit.time().seconds(),
            })
        })
        .collect()
}

#[tauri::command]
pub fn git_revert(repo_path: String, commit_id: String) -> Result<(), String> {
    let repo = git2::Repository::open(&repo_path).map_err(|e| e.to_string())?;
    let oid = Oid::from_str(&commit_id).map_err(|e| e.to_string())?;
    let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;

    repo.reset(commit.as_object(), ResetType::Hard, None)
        .map_err(|e| e.to_string())?;

    Ok(())
}
