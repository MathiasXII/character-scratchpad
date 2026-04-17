const { invoke } = window.__TAURI__;

import { dom, state } from "./app.js";
import { showSaveError } from "./editor.js";
import { handleCharacterSelect } from "./characters.js";

let isCommitting = false;

function formatTimestamp(unix) {
  const date = new Date(unix * 1000);
  return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function updateGitBarVisibility() {
  const bar = document.getElementById("version-control-bar");
  const commitInput = document.getElementById("git-commit-input");
  if (state.selectedCharacter) {
    bar.classList.remove("hidden");
  } else {
    bar.classList.add("hidden");
    commitInput.classList.add("hidden");
  }
}

export function initGit() {
  const commitBtn = document.getElementById("git-commit-btn");
  const commitConfirm = document.getElementById("git-commit-confirm");
  const commitCancel = document.getElementById("git-commit-cancel");
  const commitMessage = document.getElementById("git-commit-message");
  const commitInput = document.getElementById("git-commit-input");
  const historyBtn = document.getElementById("git-history-btn");
  const historyClose = document.getElementById("git-history-close");
  const historyModal = document.getElementById("git-history-modal");

  commitBtn.addEventListener("click", () => {
    commitInput.classList.remove("hidden");
    commitMessage.focus();
  });

  commitConfirm.addEventListener("click", () => handleGitCommit());

  commitCancel.addEventListener("click", () => {
    commitInput.classList.add("hidden");
  });

  commitMessage.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleGitCommit();
    } else if (event.key === "Escape") {
      commitInput.classList.add("hidden");
    }
  });

  historyBtn.addEventListener("click", () => openGitHistory());

  historyClose.addEventListener("click", () => closeGitHistory());

  historyModal.addEventListener("click", (event) => {
    if (event.target === historyModal) {
      closeGitHistory();
    }
  });

  updateGitBarVisibility();
}

export async function handleGitCommit() {
  if (!state.selectedCharacter || isCommitting) return;

  const commitMessage = document.getElementById("git-commit-message");
  const commitInput = document.getElementById("git-commit-input");
  const commitConfirm = document.getElementById("git-commit-confirm");

  const message = commitMessage.value.trim();
  if (!message) {
    commitMessage.style.borderColor = "var(--error)";
    return;
  }

  isCommitting = true;
  commitConfirm.disabled = true;

  const repoPath = state.currentWorkFolder + "/" + state.selectedCharacter;

  try {
    await invoke("git_commit", { repoPath, message });
    commitInput.classList.add("hidden");
    commitMessage.value = "";
    commitMessage.style.borderColor = "";
  } catch (error) {
    showSaveError("Git commit failed: " + (typeof error === "string" ? error : String(error)));
  } finally {
    isCommitting = false;
    commitConfirm.disabled = false;
  }
}

export async function openGitHistory() {
  if (!state.selectedCharacter) return;

  const repoPath = state.currentWorkFolder + "/" + state.selectedCharacter;
  const historyList = document.getElementById("git-history-list");
  const historyModal = document.getElementById("git-history-modal");

  try {
    const commits = await invoke("git_log", { repoPath });

    historyList.innerHTML = "";

    if (commits.length === 0) {
      historyList.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 20px;">No commits yet</div>';
    } else {
      for (const entry of commits) {
        const el = document.createElement("div");
        el.className = "git-history-entry";
        el.innerHTML = `
          <div class="git-entry-info">
            <span class="git-entry-message">${escapeHtml(entry.message)}</span>
            <span class="git-entry-time">${formatTimestamp(entry.timestamp)}</span>
          </div>
          <button class="git-revert-btn" data-commit-id="${escapeHtml(entry.id)}">Revert to this</button>
        `;
        el.querySelector(".git-revert-btn").addEventListener("click", () => {
          handleGitRevert(entry.id);
        });
        historyList.appendChild(el);
      }
    }

    historyModal.classList.remove("hidden");
  } catch (error) {
    showSaveError("Git log failed: " + (typeof error === "string" ? error : String(error)));
  }
}

export function closeGitHistory() {
  document.getElementById("git-history-modal").classList.add("hidden");
}

export async function handleGitRevert(commitId) {
  if (!state.selectedCharacter) return;

  const confirmed = window.confirm("Revert to this commit? All current changes will be lost.");
  if (!confirmed) return;

  const repoPath = state.currentWorkFolder + "/" + state.selectedCharacter;

  try {
    await invoke("git_revert", { repoPath, commitId });
    await handleCharacterSelect();
  } catch (error) {
    showSaveError("Git revert failed: " + (typeof error === "string" ? error : String(error)));
  }

  closeGitHistory();
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
