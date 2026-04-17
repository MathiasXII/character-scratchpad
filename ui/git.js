const { invoke } = window.__TAURI__;

import { dom, state } from "./app.js";
import { showSaveError } from "./editor.js";
import { handleCharacterSelect } from "./characters.js";

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
  return state.currentWorkFolder + "/" + state.selectedCharacter;
}

// --- Dirty state indicator ---

export async function checkDirty() {
  const indicator = document.getElementById("git-status-indicator");
  const saveBtn = document.getElementById("git-commit-btn");
  if (!indicator || !saveBtn) return;

  const repoPath = getRepoPath();
  if (!repoPath) {
    indicator.textContent = "";
    indicator.className = "git-status-indicator";
    saveBtn.classList.remove("has-changes");
    saveBtn.disabled = true;
    return;
  }

  try {
    const dirty = await invoke("git_is_dirty", { repoPath });
    if (dirty) {
      indicator.textContent = "Unsaved changes";
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
    // If git_is_dirty fails (e.g. no git repo yet), just leave the indicator empty
    indicator.textContent = "";
    indicator.className = "git-status-indicator";
    saveBtn.classList.remove("has-changes");
    saveBtn.disabled = true;
  }
}

// --- Visibility ---

export function updateGitBarVisibility() {
  const bar = document.getElementById("version-control-bar");
  if (!bar) return;
  if (state.selectedCharacter) {
    bar.classList.remove("hidden");
  } else {
    bar.classList.add("hidden");
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

  const saveBtn = document.getElementById("git-commit-btn");
  if (saveBtn) saveBtn.disabled = true;

  // Generate timestamp commit message
  const now = new Date();
  const message = "Checkpoint — " + now.toLocaleString();

  showStatus("Saving...", "saving");

  try {
    await invoke("git_commit", { repoPath, message });

    showStatus("✓ Saved", "saved");
    await checkDirty();

    // Background: generate AI name and amend the commit
    renameCheckpointInBackground(repoPath);

    // Auto-hide "✓ Saved" after 2 seconds
    setTimeout(hideStatus, 2000);
  } catch (error) {
    showSaveError("Checkpoint failed: " + (typeof error === "string" ? error : String(error)));
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
        el.innerHTML = `
          <div class="git-entry-info">
            <span class="git-entry-message">${escapeHtml(entry.message)}</span>
            <span class="git-entry-time">${formatTimestamp(entry.timestamp)}</span>
          </div>
          <button class="git-revert-btn" data-commit-id="${escapeHtml(entry.id)}">Restore this version</button>
        `;
        el.querySelector(".git-revert-btn").addEventListener("click", () => {
          handleGitRevert(entry.id);
        });
        historyList.appendChild(el);
      }
    }

    historyModal.classList.remove("hidden");
  } catch (error) {
    showSaveError("Failed to load history: " + (typeof error === "string" ? error : String(error)));
  }
}

export function closeGitHistory() {
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
    await handleCharacterSelect();
    await checkDirty();
  } catch (error) {
    showSaveError("Restore failed: " + (typeof error === "string" ? error : String(error)));
  }

  closeGitHistory();
}

// --- Init ---

export function initGit() {
  const saveBtn = document.getElementById("git-commit-btn");
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

  if (historyModal) {
    historyModal.addEventListener("click", (event) => {
      if (event.target === historyModal) {
        closeGitHistory();
      }
    });
  }

  updateGitBarVisibility();
}
