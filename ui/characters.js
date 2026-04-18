const { invoke } = window.__TAURI__;

import { dom, state, TAB_FILE_MAP } from "./app.js";
import { updateTokenCounter, getEditorValue, setEditorValue, setEditorPlaceholder } from "./editor.js";
import { openSettingsModal } from "./settings.js";
import { updateGitBarVisibility, checkDirty } from "./git.js";

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
    console.error("Failed to load characters:", error);
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
    for (const key in state.tabContents) {
      state.tabContents[key] = "";
    }
    state.contextFiles = [];
    setEditorValue("");
    setEditorPlaceholder("Select a character to start editing...");
    updateTokenCounter();
    updateGitBarVisibility();
    checkDirty();
    return;
  }

  state.selectedCharacter = name;
  state.isLoadingCharacter = true;

  try {
    // Ensure all necessary character files exist
    await invoke("ensure_character_files", { workFolder: state.currentWorkFolder, name });
  } catch (error) {
    console.error("Failed to ensure character files:", error);
    // Continue anyway - we'll try to load files even if some are missing
  }

  const charDir = state.currentWorkFolder + "/" + name;
  const fileEntries = Object.entries(TAB_FILE_MAP).map(([key, filename]) => [
    key,
    charDir + "/" + filename,
  ]);

  const results = await Promise.all(
    fileEntries.map(([key, path]) =>
      invoke("load_file", { path })
        .then((content) => ({ key, content }))
        .catch((error) => {
          console.error(`Failed to load ${key}:`, error);
          return { key, content: "" };
        })
    )
  );

  for (const { key, content } of results) {
    state.tabContents[key] = content;
    state.lastSavedContent[key] = content;
  }

  // Load context files from the character's context/ directory
  try {
    state.contextFiles = await invoke("list_context_files", { characterDir: charDir });
  } catch (error) {
    console.error("Failed to load context files:", error);
    state.contextFiles = [];
  }

  setEditorValue(state.tabContents[state.activeTab]);
  setEditorPlaceholder("Start editing...");
  updateTokenCounter();
  state.isLoadingCharacter = false;
  updateGitBarVisibility();
  checkDirty();
}
