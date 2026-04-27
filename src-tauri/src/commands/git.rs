use std::collections::HashSet;
use std::ffi::OsStr;
use std::path::Path;

use git2::{IndexAddOption, Oid, ResetType, Signature, Sort, StatusOptions};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::commands::http::{chat_completions_url, with_auth_json};
use crate::commands::line_endings::normalize_line_endings;
use crate::state::AppState;
use crate::types::{ChatCompletionRequest, ChatMessage};

#[derive(Serialize, Deserialize)]
pub struct CommitEntry {
    pub id: String,
    pub message: String,
    pub timestamp: i64,
    pub is_current: bool,
}

pub(crate) fn open_repo(repo_path: &str) -> Result<git2::Repository, String> {
    git2::Repository::open(repo_path).map_err(|e| e.to_string())
}

pub(crate) fn create_signature() -> Result<Signature<'static>, String> {
    Signature::now("Character Scratch Pad", "app@localhost").map_err(|e| e.to_string())
}

/// Stage all files in the repository, excluding .git internals.
pub(crate) fn stage_all_excluding_git(index: &mut git2::Index) -> Result<(), git2::Error> {
    index.add_all(
        ["."],
        IndexAddOption::DEFAULT,
        Some(&mut |path: &Path, _: &[u8]| {
            if path.components().any(|c| c.as_os_str() == OsStr::new(".git")) {
                1 // skip
            } else {
                0 // include
            }
        }),
    )
}

#[tauri::command]
pub fn git_commit(repo_path: String, message: String) -> Result<String, String> {
    let repo = open_repo(&repo_path)?;
    let sig = create_signature()?;

    let mut index = repo.index().map_err(|e| e.to_string())?;
    stage_all_excluding_git(&mut index).map_err(|e| e.to_string())?;
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
    let repo = open_repo(&repo_path)?;

    // Empty repo — nothing to list
    if repo.is_empty().unwrap_or(true) {
        return Ok(Vec::new());
    }

    // Resolve current HEAD OID for is_current marking
    let head_oid = repo
        .head()
        .ok()
        .and_then(|r| r.peel_to_commit().ok())
        .map(|c| c.id());

    // Collect OIDs reachable from HEAD via revwalk
    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    revwalk.push_head().map_err(|e| e.to_string())?;
    revwalk.set_sorting(Sort::TIME).map_err(|e| e.to_string())?;

    let mut seen_oids: HashSet<Oid> = HashSet::new();
    let mut entries: Vec<CommitEntry> = Vec::new();

    for oid_result in revwalk {
        let oid = oid_result.map_err(|e| e.to_string())?;
        seen_oids.insert(oid);
        let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
        entries.push(CommitEntry {
            id: commit.id().to_string(),
            message: commit.message().map(str::trim).unwrap_or("").to_string(),
            timestamp: commit.time().seconds(),
            is_current: head_oid == Some(commit.id()),
        });
    }

    // Also include commits reachable via reflog that aren't in the revwalk
    if let Ok(reflog) = repo.reflog("HEAD") {
        for entry in reflog.iter() {
            let oid = entry.id_new();
            if seen_oids.contains(&oid) {
                continue;
            }
            // Skip the zero OID (indicates a birth entry with no prior commit)
            if oid.is_zero() {
                continue;
            }
            seen_oids.insert(oid);
            let commit = match repo.find_commit(oid) {
                Ok(c) => c,
                Err(_) => continue, // OID no longer resolvable (e.g. garbage-collected)
            };
            entries.push(CommitEntry {
                id: commit.id().to_string(),
                message: commit.message().map(str::trim).unwrap_or("").to_string(),
                timestamp: commit.time().seconds(),
                is_current: head_oid == Some(commit.id()),
            });
        }
    }

    // Sort all entries by timestamp descending (newest first)
    entries.sort_by_key(|b| std::cmp::Reverse(b.timestamp));

    // Limit to 50 entries total
    entries.truncate(50);

    Ok(entries)
}

#[tauri::command]
pub fn git_revert(repo_path: String, commit_id: String) -> Result<(), String> {
    let repo = open_repo(&repo_path)?;
    let oid = Oid::from_str(&commit_id).map_err(|e| e.to_string())?;
    let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;

    repo.reset(commit.as_object(), ResetType::Hard, None)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn git_is_dirty(repo_path: String) -> Result<bool, String> {
    let repo = open_repo(&repo_path)?;

    if repo.is_empty().unwrap_or(false) {
        return Ok(true);
    }

    let mut opts = StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true);

    let statuses_result = repo.statuses(Some(&mut opts));

    match statuses_result {
        Ok(statuses) => Ok(!statuses.is_empty()),
        Err(e) => {
            if repo.is_empty().unwrap_or(false) {
                Ok(true)
            } else {
                Err(e.to_string())
            }
        }
    }
}

/// Read the content of a file as it exists in the HEAD commit.
/// Returns `None` if the repo is empty or the file doesn't exist at HEAD.
#[tauri::command]
pub fn git_get_head_content(repo_path: String, file_path: String) -> Result<Option<String>, String> {
    let repo = open_repo(&repo_path)?;

    // If the repo has no commits, no HEAD content exists
    if repo.is_empty().unwrap_or(true) {
        return Ok(None);
    }

    let head = repo.head().map_err(|e| e.to_string())?;
    let commit = head.peel_to_commit().map_err(|e| e.to_string())?;
    let tree = commit.tree().map_err(|e| e.to_string())?;

    // file_path is relative to the repo root (e.g. "instructions.txt")
    let entry = match tree.get_path(Path::new(&file_path)) {
        Ok(entry) => entry,
        Err(_) => return Ok(None), // File doesn't exist at HEAD
    };

    let blob = repo.find_blob(entry.id()).map_err(|e| e.to_string())?;
    let content = match std::str::from_utf8(blob.content()) {
        Ok(c) => c,
        Err(_) => return Ok(None),
    };

    // Normalize line endings to LF for consistent comparison with editor content
    Ok(Some(normalize_line_endings(content)))
}

/// List all non-hidden filenames in a folder at the HEAD commit.
/// Returns an empty Vec if the repo is empty or the folder doesn't exist at HEAD.
/// Extension filtering is left to the caller (JS side) so scope is controlled by config.
#[tauri::command]
pub fn git_list_head_folder(repo_path: String, folder_path: String) -> Result<Vec<String>, String> {
    let repo = open_repo(&repo_path)?;

    if repo.is_empty().unwrap_or(true) {
        return Ok(Vec::new());
    }

    let head = repo.head().map_err(|e| e.to_string())?;
    let commit = head.peel_to_commit().map_err(|e| e.to_string())?;
    let tree = commit.tree().map_err(|e| e.to_string())?;

    let folder_tree = match tree.get_path(Path::new(&folder_path)) {
        Ok(entry) => {
            let obj = entry.to_object(&repo).map_err(|e| e.to_string())?;
            match obj.as_tree() {
                Some(t) => t.clone(),
                None => return Ok(Vec::new()), // not a directory
            }
        }
        Err(_) => return Ok(Vec::new()), // folder doesn't exist at HEAD
    };

    let mut names = Vec::new();
    for entry in folder_tree.iter() {
        if let Some(name) = entry.name() {
            if !name.starts_with('.') {
                names.push(name.to_string());
            }
        }
    }

    Ok(names)
}

#[tauri::command]
pub fn git_diff_last(repo_path: String) -> Result<String, String> {
    let repo = open_repo(&repo_path)?;
    let head = match repo.head() {
        Ok(head) => head,
        Err(_) => return Ok(String::new()),
    };
    let commit = head.peel_to_commit().map_err(|e| e.to_string())?;
    let tree = commit.tree().map_err(|e| e.to_string())?;
    let parent_tree = match commit.parent(0) {
        Ok(parent) => Some(parent.tree().map_err(|e| e.to_string())?),
        Err(_) => None,
    };

    let diff = repo
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)
        .map_err(|e| e.to_string())?;
    let mut diff_text = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        diff_text.push_str(&String::from_utf8_lossy(line.content()));
        true
    })
    .map_err(|e| e.to_string())?;

    if let Some((byte_idx, _)) = diff_text.char_indices().nth(4000) {
        diff_text.truncate(byte_idx);
        diff_text.push_str("\n... (truncated)");
    }
    Ok(diff_text)
}

#[tauri::command]
pub fn git_commit_amend(repo_path: String, message: String) -> Result<(), String> {
    let repo = open_repo(&repo_path)?;
    let head = repo.head().map_err(|e| e.to_string())?;
    let commit = head.peel_to_commit().map_err(|e| e.to_string())?;

    commit
        .amend(Some("HEAD"), None, None, None, Some(&message), None)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn generate_checkpoint_name(
    state: State<'_, AppState>,
    diff: String,
) -> Result<String, String> {
    let api_key = state.api_key.lock().map_err(|e| e.to_string())?.clone();
    let model = state.model.lock().map_err(|e| e.to_string())?.clone();
    let endpoint = state.endpoint.lock().map_err(|e| e.to_string())?.clone();

    if api_key.is_empty() {
        return Err("API key not set".into());
    }

    let request_body = ChatCompletionRequest {
        model,
        messages: vec![
            ChatMessage {
                role: "system".to_string(),
                content: "You generate short checkpoint names for character file edits. Given a diff of changes, generate a concise 3-6 word descriptive name. Reply with ONLY the name, no quotes, no punctuation, no explanation.".to_string(),
                is_file: None,
            },
            ChatMessage {
                role: "user".to_string(),
                content: diff,
                is_file: None,
            },
        ],
        stream: false,
        max_tokens: None,
        temperature: None,
        top_p: None,
    };

    let response = match with_auth_json(
        state.client.post(chat_completions_url(&endpoint)),
        &api_key,
    )
    .json(&request_body)
    .send()
    .await
    {
        Ok(response) => response,
        Err(_) => return Ok("Checkpoint".to_string()),
    };

    if !response.status().is_success() {
        return Ok("Checkpoint".to_string());
    }

    let response_json = match response.json::<serde_json::Value>().await {
        Ok(json) => json,
        Err(_) => return Ok("Checkpoint".to_string()),
    };

    let checkpoint_name = response_json["choices"][0]["message"]["content"]
        .as_str()
        .map(str::trim)
        .unwrap_or("")
        .to_string();

    if checkpoint_name.is_empty() {
        Ok("Checkpoint".to_string())
    } else {
        Ok(checkpoint_name)
    }
}
