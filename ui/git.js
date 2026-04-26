const { invoke } = window.__TAURI__.core;

import { dom, state, TAB_FILE_MAP, TRACKED_FOLDERS } from "./app.js";
import { showSaveError, saveCurrentTab } from "./editor.js";
import { reloadAfterRevert } from "./characters.js";
import { getEditorValue } from "./editor.js";
import { getCharacterDir, formatError } from "./helpers.js";

let isCommitting = false;

function formatTimestamp(unix) {
  const date = new Date(unix * 1000);
  return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function getRepoPath() {
  if (!state.currentWorkFolder || !state.selectedCharacter) return null;
  return getCharacterDir(state.currentWorkFolder, state.selectedCharacter);
}

// --- Dirty state indicator ---

/**
 * Compare current file contents against the last git commit (HEAD) to determine
 * whether there are pending changes. Only checks files defined in TRACKED_TAB_FILES
 * and TRACKED_FOLDERS — invisible files are ignored.
 */
export async function checkDirty() {
  const indicator = dom.gitStatusIndicator;
  const saveBtn = dom.gitCommitBtn;
  if (!indicator || !saveBtn) return;

  const repoPath = getRepoPath();
  if (!repoPath) {
    indicator.textContent = "";
    indicator.className = "git-status-indicator";
    saveBtn.classList.remove("has-changes");
    saveBtn.classList.add("hidden");
    saveBtn.disabled = true;
    return;
  }

  // Ensure saveBtn is visible when a character is selected
  saveBtn.classList.remove("hidden");

  try {
    let hasPendingChanges = false;

    // Sync active context file content from editor before dirty check
    if (state.activeTab === "context" && state.activeContextFile && state.cmView) {
      const editorContent = state.cmView.state.doc.toString();
      const file = state.contextFiles.find(f => f.name === state.activeContextFile);
      if (file) file.content = editorContent;
    }

    // 1. Check tab files: compare editor content (for active tab) or in-memory content
    //    against the committed version at HEAD
    for (const [tabKey, filename] of Object.entries(TAB_FILE_MAP)) {
      let currentContent;

      if (tabKey === state.activeTab && state.cmView) {
        // Active tab: use live editor content
        currentContent = getEditorValue();
      } else {
        // Inactive tab: use cached in-memory content
        currentContent = state.tabContents[tabKey] ?? "";
      }

      const headContent = await invoke("git_get_head_content", {
        repoPath,
        filePath: filename,
      });

      // If the file doesn't exist at HEAD, it's a new file → pending change
      if (headContent === null) {
        hasPendingChanges = true;
        break;
      }

      if (currentContent !== headContent) {
        hasPendingChanges = true;
        break;
      }
    }

    // 2. If tab files are clean, check context folder files against HEAD
    if (!hasPendingChanges && state.contextFiles && state.contextFiles.length > 0) {
      for (const folderConfig of TRACKED_FOLDERS) {
        for (const file of state.contextFiles) {
          // Only check files whose extension is tracked
          const ext = "." + file.name.split(".").pop();
          if (!folderConfig.extensions.includes(ext)) continue;

          const headContent = await invoke("git_get_head_content", {
            repoPath,
            filePath: folderConfig.path + "/" + file.name,
          });

          if (headContent === null) {
            // New context file not in HEAD → pending change
            hasPendingChanges = true;
            break;
          }

          // Context file content comes from list_context_files (already LF-normalized by Rust)
          if (file.content !== headContent) {
            hasPendingChanges = true;
            break;
          }
        }
        if (hasPendingChanges) break;
      }
    }

    // 2b. Check for deleted context files: files that exist at HEAD but are missing from state
    if (!hasPendingChanges) {
      for (const folderConfig of TRACKED_FOLDERS) {
        const headFiles = await invoke("git_list_head_folder", {
          repoPath,
          folderPath: folderConfig.path,
        });
        // Filter by tracked extensions (scope controlled by config)
        const trackedHeadFiles = headFiles.filter(name => {
          const ext = "." + name.split(".").pop();
          return folderConfig.extensions.includes(ext);
        });
        const currentNames = (state.contextFiles || []).map(f => f.name);
        for (const headName of trackedHeadFiles) {
          if (!currentNames.includes(headName)) {
            // File existed at HEAD but was deleted → pending change
            hasPendingChanges = true;
            break;
          }
        }
        if (hasPendingChanges) break;
      }
    }

    if (hasPendingChanges) {
      indicator.textContent = "Pending changes";
      indicator.className = "git-status-indicator dirty";
      saveBtn.classList.add("has-changes");
      saveBtn.disabled = false;
    } else {
      indicator.textContent = "All saved";
      indicator.className = "git-status-indicator clean";
      saveBtn.classList.remove("has-changes");
      saveBtn.disabled = true;
    }
  } catch (error) {
    // If the repo is empty or git commands fail, fall back to git_is_dirty
    // (e.g. brand-new character with no commits yet)
    try {
      const dirty = await invoke("git_is_dirty", { repoPath });
      if (dirty) {
        indicator.textContent = "Pending changes";
        indicator.className = "git-status-indicator dirty";
        saveBtn.classList.add("has-changes");
        saveBtn.disabled = false;
      } else {
        indicator.textContent = "All saved";
        indicator.className = "git-status-indicator clean";
        saveBtn.classList.remove("has-changes");
        saveBtn.disabled = true;
      }
    } catch {
      // If both approaches fail (e.g. no git repo yet), just leave the indicator empty
      indicator.textContent = "";
      indicator.className = "git-status-indicator";
      saveBtn.classList.remove("has-changes");
      saveBtn.disabled = true;
    }
  }
}

// --- Visibility ---

export function updateGitBarVisibility() {
  const historyBtn = document.getElementById("git-history-btn");
  const saveBtn = dom.gitCommitBtn;
  const indicator = dom.gitStatusIndicator;

  if (state.selectedCharacter) {
    if (historyBtn) historyBtn.classList.remove("hidden");
    // saveBtn visibility is controlled by checkDirty (disabled when clean)
  } else {
    if (historyBtn) historyBtn.classList.add("hidden");
    if (saveBtn) { saveBtn.classList.add("hidden"); saveBtn.disabled = true; }
    if (indicator) { indicator.textContent = ""; indicator.className = "git-status-indicator"; }
  }
}

// --- Save checkpoint flow ---

function showStatus(message, type) {
  const status = document.getElementById("git-save-status");
  if (!status) return;
  status.textContent = message;
  status.className = "git-save-status " + type;
  // Force reflow for animation reset
  void status.offsetWidth;
  status.classList.add("visible");
}

function hideStatus() {
  const status = document.getElementById("git-save-status");
  if (!status) return;
  status.classList.remove("visible");
}

async function handleSaveCheckpoint() {
  if (!state.selectedCharacter || isCommitting) return;
  isCommitting = true;

  const repoPath = getRepoPath();
  if (!repoPath) { isCommitting = false; return; }

  const saveBtn = dom.gitCommitBtn;
  if (saveBtn) saveBtn.disabled = true;

  // Generate timestamp commit message
  const now = new Date();
  const message = "Checkpoint — " + now.toLocaleString();

  showStatus("Saving...", "saving");

  try {
    await saveCurrentTab();
    await invoke("git_commit", { repoPath, message });

    showStatus("✓ Saved", "saved");
    await checkDirty();

    // Background: generate AI name and amend the commit
    renameCheckpointInBackground(repoPath);

    // Auto-hide "✓ Saved" after 2 seconds
    setTimeout(hideStatus, 2000);
  } catch (error) {
    showSaveError("Checkpoint failed: " + formatError(error));
    hideStatus();
  } finally {
    isCommitting = false;
    // Don't re-enable button here — checkDirty() already set disabled state
  }
}

async function renameCheckpointInBackground(repoPath) {
  try {
    const diff = await invoke("git_diff_last", { repoPath });
    if (!diff || diff.trim().length === 0) return; // no diff, skip rename

    const newName = await invoke("generate_checkpoint_name", { diff });
    if (newName && newName.trim().length > 0) {
      await invoke("git_commit_amend", { repoPath, message: newName.trim() });
    }
  } catch {
    // Silently fail — the timestamp name is perfectly fine
  }
}

// --- History ---

export async function openGitHistory() {
  if (!state.selectedCharacter) return;

  const repoPath = getRepoPath();
  if (!repoPath) return;

  const historyList = document.getElementById("git-history-list");
  const historyModal = document.getElementById("git-history-modal");
  if (!historyList || !historyModal) return;

  try {
    const commits = await invoke("git_log", { repoPath });

    historyList.innerHTML = "";

    if (commits.length === 0) {
      historyList.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 20px;">No checkpoints yet</div>';
    } else {
      for (const entry of commits) {
        const el = document.createElement("div");
        el.className = "git-history-entry";
        if (entry.is_current) {
          el.classList.add("current");
        }

        const isCurrent = !!entry.is_current;
        const buttonLabel = isCurrent ? "Current version" : "Restore this version";
        el.innerHTML = `
          <div class="git-entry-info">
            <span class="git-entry-message">${escapeHtml(entry.message)}</span>
            <span class="git-entry-time">${formatTimestamp(entry.timestamp)}</span>
          </div>
          <button class="git-revert-btn" data-commit-id="${escapeHtml(entry.id)}"${isCurrent ? " disabled" : ""}>${buttonLabel}</button>
        `;
        if (!isCurrent) {
          el.querySelector(".git-revert-btn").addEventListener("click", () => {
            handleGitRevert(entry.id);
          });
        }
        historyList.appendChild(el);
      }
    }

    historyModal.classList.remove("hidden");

    requestAnimationFrame(() => {
      const currentEntry = historyList.querySelector(".git-history-entry.current");
      if (currentEntry) {
        currentEntry.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });
  } catch (error) {
    showSaveError("Failed to load history: " + formatError(error));
  }
}

function closeGitHistory() {
  const historyModal = document.getElementById("git-history-modal");
  if (historyModal) historyModal.classList.add("hidden");
}

async function handleGitRevert(commitId) {
  if (!state.selectedCharacter) return;

  const confirmed = window.confirm("Restore this version? Your current changes will be replaced by the selected checkpoint.");
  if (!confirmed) return;

  const repoPath = getRepoPath();
  if (!repoPath) return;

  try {
    await invoke("git_revert", { repoPath, commitId });
    await reloadAfterRevert();
    await checkDirty();
  } catch (error) {
    showSaveError("Restore failed: " + formatError(error));
  }

  closeGitHistory();
}

// --- Init ---

export function initGit() {
  const saveBtn = dom.gitCommitBtn;
  const historyBtn = document.getElementById("git-history-btn");
  const historyClose = document.getElementById("git-history-close");
  const historyModal = document.getElementById("git-history-modal");

  if (saveBtn) {
    saveBtn.addEventListener("click", handleSaveCheckpoint);
  }

  if (historyBtn) {
    historyBtn.addEventListener("click", openGitHistory);
  }

  if (historyClose) {
    historyClose.addEventListener("click", closeGitHistory);
  }



  updateGitBarVisibility();
}
