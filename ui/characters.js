const { invoke } = window.__TAURI__.core;

import { dom, state, TAB_FILE_MAP, updateUIState } from "./app.js";
import { getRepoPath, formatError } from "./helpers.js";
import { updateTokenCounter, getEditorValue, setEditorValue, setEditorPlaceholder, updateInstructionsVisibility } from "./editor.js";
import { openSettingsModal } from "./settings.js";
import { updateGitBarVisibility, checkDirty } from "./git.js";
import { renderContextFileList } from "./context.js";
import { syncFirstResponse } from "./chat.js";

/**
 * Load all character tab files and context files from disk.
 * Returns { tabContents, lastSavedContent, contextFiles } without modifying state.
 */
async function loadCharacterFiles(charDir) {
  const fileEntries = Object.entries(TAB_FILE_MAP).map(([key, filename]) => [
    key,
    charDir + "/" + filename,
  ]);

  const results = await Promise.all(
    fileEntries.map(([key, path]) =>
      invoke("load_file", { path, workFolder: state.currentWorkFolder })
        .then((content) => ({ key, content }))
        .catch((error) => {
          console.error(`Failed to load ${key}:`, formatError(error));
          return { key, content: "" };
        })
    )
  );

  const tabContents = {};
  const lastSavedContent = {};
  for (const { key, content } of results) {
    tabContents[key] = content;
    lastSavedContent[key] = content;
  }

  let contextFiles = [];
  try {
    contextFiles = await invoke("list_context_files", { characterDir: charDir, workFolder: state.currentWorkFolder });
  } catch (error) {
    console.error("Failed to load context files:", formatError(error));
  }

  return { tabContents, lastSavedContent, contextFiles };
}

/**
 * Refresh UI elements after character data changes.
 */
function refreshCharacterUI() {
  updateTokenCounter();
  updateInstructionsVisibility();
  updateGitBarVisibility();
  checkDirty();
  updateUIState();
  syncFirstResponse();
}

export async function loadCharacters() {
  dom.characterSelect.innerHTML = "";
  dom.characterSelect.disabled = true;

  if (!state.currentWorkFolder) {
    const opt = document.createElement("option");
    opt.textContent = "Set work folder in Settings";
    opt.value = "";
    dom.characterSelect.appendChild(opt);
    return;
  }

  try {
    const characters = await invoke("list_characters", { workFolder: state.currentWorkFolder });

    if (characters.length === 0) {
      const opt = document.createElement("option");
      opt.textContent = "No characters yet";
      opt.value = "";
      dom.characterSelect.appendChild(opt);
    } else {
      const placeholder = document.createElement("option");
      placeholder.textContent = "Scratchpad (no save)";
      placeholder.value = "";
      dom.characterSelect.appendChild(placeholder);

      for (const name of characters) {
        const opt = document.createElement("option");
        opt.textContent = name;
        opt.value = name;
        dom.characterSelect.appendChild(opt);
      }
      dom.characterSelect.disabled = false;
    }
  } catch (error) {
    const opt = document.createElement("option");
    opt.textContent = "Error loading characters";
    opt.value = "";
    dom.characterSelect.appendChild(opt);
    console.error("Failed to load characters:", formatError(error));
  }
  updateGitBarVisibility();
  checkDirty();
}

export function openNewCharacterModal() {
  if (!state.currentWorkFolder) {
    openSettingsModal();
    return;
  }

  dom.newCharacterNameInput.value = "";
  dom.newCharacterNameInput.style.borderColor = "";
  dom.newCharacterModal.classList.remove("hidden");
  dom.newCharacterNameInput.focus();
}

export function closeNewCharacterModal() {
  dom.newCharacterModal.classList.add("hidden");
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !dom.newCharacterModal.classList.contains("hidden")) {
    closeNewCharacterModal();
  }
});

export async function handleCreateCharacter() {
  const name = dom.newCharacterNameInput.value.trim();
  if (!name) {
    dom.newCharacterNameInput.style.borderColor = "var(--error)";
    dom.newCharacterNameInput.focus();
    return;
  }

  dom.newCharacterCreate.disabled = true;
  try {
    await invoke("create_character", { workFolder: state.currentWorkFolder, name });
    await loadCharacters();
    dom.characterSelect.value = name;
    await handleCharacterSelect();
    closeNewCharacterModal();
  } catch (error) {
    dom.newCharacterNameInput.style.borderColor = "var(--error)";
    dom.newCharacterNameInput.value = "";
    dom.newCharacterNameInput.placeholder =
      typeof error === "string" ? error : String(error);
    dom.newCharacterNameInput.focus();
  } finally {
    dom.newCharacterCreate.disabled = false;
  }
}

export async function handleCharacterSelect() {
  const name = dom.characterSelect.value;

  clearTimeout(state.saveTimeout);
  state.saveTimeout = null;

  if (!name) {
    state.selectedCharacter = "";
    state.contextLastSaved = {};
    for (const key in state.tabContents) {
      state.tabContents[key] = "";
    }
    state.contextFiles = [];
    state.activeContextFile = null;
    setEditorValue("");
    setEditorPlaceholder("Select a character to start editing...");
    renderContextFileList();
    updateTokenCounter();
    updateInstructionsVisibility();
    updateGitBarVisibility();
    checkDirty();
    updateUIState();
    return;
  }

  state.selectedCharacter = name;
  state.isLoadingCharacter = true;

  try {
    // Ensure all necessary character files exist
    await invoke("ensure_character_files", { workFolder: state.currentWorkFolder, name });
  } catch (error) {
    console.error("Failed to ensure character files:", formatError(error));
    // Continue anyway - we'll try to load files even if some are missing
  }

  const charDir = getRepoPath(state);
  const { tabContents, lastSavedContent, contextFiles } = await loadCharacterFiles(charDir);

  for (const key in tabContents) {
    state.tabContents[key] = tabContents[key];
    state.lastSavedContent[key] = lastSavedContent[key];
  }

  state.contextFiles = contextFiles;
  state.activeContextFile = null;
  state.contextLastSaved = {};
  renderContextFileList();

  setEditorValue(state.tabContents[state.activeTab]);
  setEditorPlaceholder("Start editing...");
  state.isLoadingCharacter = false;
  refreshCharacterUI();
}

/**
 * Reload file contents from disk after a git revert.
 * Unlike handleCharacterSelect, this does NOT call ensure_character_files
 * (which would recreate missing files and overwrite the reverted state)
 * and preserves the active context file if it still exists.
 */
export async function reloadAfterRevert() {
  clearTimeout(state.saveTimeout);
  state.saveTimeout = null;

  const charDir = getRepoPath(state);
  const { tabContents, lastSavedContent, contextFiles } = await loadCharacterFiles(charDir);

  for (const key in tabContents) {
    state.tabContents[key] = tabContents[key];
    state.lastSavedContent[key] = lastSavedContent[key];
  }

  state.contextFiles = contextFiles;

  if (state.activeContextFile) {
    const stillExists = state.contextFiles.find((f) => f.name === state.activeContextFile);
    if (!stillExists) {
      state.activeContextFile = null;
    }
  }

  state.contextLastSaved = {};
  for (const file of state.contextFiles) {
    state.contextLastSaved[file.name] = file.content;
  }

  renderContextFileList();

  if (state.activeTab === "context") {
    if (state.activeContextFile) {
      const file = state.contextFiles.find((f) => f.name === state.activeContextFile);
      setEditorValue(file?.content ?? "");
      setEditorPlaceholder("Start editing...");
    } else {
      setEditorValue("");
      setEditorPlaceholder("Select a context file...");
    }
  } else {
    setEditorValue(state.tabContents[state.activeTab]);
    setEditorPlaceholder("Start editing...");
  }

  refreshCharacterUI();
}
