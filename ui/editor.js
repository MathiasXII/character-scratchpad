const { invoke } = window.__TAURI__.core;

import { dom, state, TAB_FILE_MAP } from "./app.js";
import { getCharacterDir, formatError } from "./helpers.js";
import { checkDirty } from "./git.js";
import { renderContextFileList } from "./context.js";

function getEditorValue() {
  return state.cmView ? state.cmView.state.doc.toString() : "";
}

function setEditorValue(text) {
  if (state.cmView) {
    state.cmView.dispatch({
      changes: { from: 0, to: state.cmView.state.doc.length, insert: text }
    });
  }
}

function setEditorPlaceholder(text) {
  const placeholderEl = dom.editorEl.querySelector(".cm-placeholder");
  if (placeholderEl) {
    placeholderEl.textContent = text;
  }
}

function setEditorReadOnly(readOnly) {
  if (state.cmView?.setReadOnly) state.cmView.setReadOnly(readOnly);
}

/**
 * Update the visibility warning for the Instructions tab.
 *
 * When the Instructions tab has non-empty content but %%CHARACTER_INSTRUCTIONS%%
 * is missing from the System Prompt tab, the instructions won't be injected
 * into the prompt at send time. This function:
 *   - Adds a warning icon next to the Instructions tab label
 *   - Tints the Instructions tab with a warning color
 *   - Shows a banner above the editor when the System Prompt tab is active
 */
function updateInstructionsVisibility() {
  const instructionsContent = (state.tabContents.instructions || "").trim();
  const systemPromptContent = state.tabContents.prompt || "";
  const isInvisible = instructionsContent.length > 0 && !systemPromptContent.includes("%%CHARACTER_INSTRUCTIONS%%");

  const instructionsTab = document.querySelector('#tab-bar .tab[data-tab="instructions"]');
  const iconEl = document.getElementById("instructions-invisible-icon");
  const bannerEl = document.getElementById("instructions-invisible-banner");

  if (isInvisible) {
    // Show warning icon on the Instructions tab
    if (iconEl) iconEl.classList.remove("hidden");
    // Tint the Instructions tab with warning color
    if (instructionsTab) instructionsTab.classList.add("tab-warning");
    // Show banner only when viewing the System Prompt tab
    if (bannerEl) {
      if (state.activeTab === "prompt") {
        bannerEl.classList.remove("hidden");
      } else {
        bannerEl.classList.add("hidden");
      }
    }
  } else {
    // Hide warning icon
    if (iconEl) iconEl.classList.add("hidden");
    // Remove warning tint
    if (instructionsTab) instructionsTab.classList.remove("tab-warning");
    // Hide banner
    if (bannerEl) bannerEl.classList.add("hidden");
  }
}

export { getEditorValue, setEditorValue, setEditorPlaceholder, setEditorReadOnly, updateInstructionsVisibility };

export async function saveCurrentTab() {
  const tab = state.activeTab;

  if (tab === "context") {
    if (!state.activeContextFile || !state.selectedCharacter || state.isLoadingCharacter) return;
    const activeFile = state.contextFiles.find(f => f.name === state.activeContextFile);
    if (activeFile?.isReadOnly) return;
    const content = getEditorValue();
    if (content === state.contextLastSaved[state.activeContextFile]) return;
    const path = state.currentWorkFolder + "/" + state.selectedCharacter + "/context/" + state.activeContextFile;
    try {
      await invoke("save_file", { path, content });
      state.contextLastSaved[state.activeContextFile] = content;
      // Sync back to state.contextFiles
      const file = state.contextFiles.find(f => f.name === state.activeContextFile);
      if (file) file.content = content;
      hideSaveError();
      checkDirty();
    } catch (error) {
      showSaveError("Save failed: " + formatError(error));
    }
    return; // IMPORTANT: return early
  }

  const content = getEditorValue();

  // Always sync editor content to state (chat reads from state)
  state.tabContents[tab] = content;

  // Only persist to disk when a character is selected
  if (!state.selectedCharacter || state.isLoadingCharacter) {
    return;
  }

  // Only save to disk if content actually changed since last load/save
  if (content === state.lastSavedContent[tab]) {
    return;
  }

  const filename = TAB_FILE_MAP[tab];
  const path = getCharacterDir(state.currentWorkFolder, state.selectedCharacter) + "/" + filename;

  try {
    await invoke("save_file", { path, content });
    state.lastSavedContent[tab] = content;
    hideSaveError();
    checkDirty();
  } catch (error) {
    showSaveError("Save failed: " + formatError(error));
  }
}

export function showSaveError(message) {
  dom.saveErrorText.textContent = message;
  dom.saveErrorBanner.classList.remove("hidden");
}

export function hideSaveError() {
  dom.saveErrorBanner.classList.add("hidden");
}

export async function switchTab(tabName) {
  if (tabName === state.activeTab) {
    return;
  }

  state.tabContents[state.activeTab] = getEditorValue();

  clearTimeout(state.saveTimeout);
  state.saveTimeout = null;

  // If leaving Context tab, save current context file first
  if (state.activeTab === "context" && state.activeContextFile && state.selectedCharacter && !state.isLoadingCharacter) {
    const leavingFile = state.contextFiles.find(f => f.name === state.activeContextFile);
    if (!leavingFile?.isReadOnly) {
      const content = getEditorValue();
      if (content !== state.contextLastSaved[state.activeContextFile]) {
        const path = getCharacterDir(state.currentWorkFolder, state.selectedCharacter) + "/context/" + state.activeContextFile;
        try {
          await invoke("save_file", { path, content });
          state.contextLastSaved[state.activeContextFile] = content;
          const file = state.contextFiles.find(f => f.name === state.activeContextFile);
          if (file) file.content = content;
          hideSaveError();
        } catch (error) {
          showSaveError("Save failed: " + formatError(error));
        }
      }
    }
  }

  if (state.selectedCharacter && !state.isLoadingCharacter && state.activeTab !== "context") {
    const oldTab = state.activeTab;
    const content = state.tabContents[oldTab];

    // Only save if content actually changed
    if (content !== state.lastSavedContent[oldTab]) {
      const filename = TAB_FILE_MAP[oldTab];
      const path = getCharacterDir(state.currentWorkFolder, state.selectedCharacter) + "/" + filename;
      invoke("save_file", { path, content })
        .then(() => {
          state.lastSavedContent[oldTab] = content;
          hideSaveError();
          checkDirty();
        })
        .catch((error) =>
          showSaveError("Save failed: " + formatError(error))
        );
    }
  }

  state.activeTab = tabName;
  dom.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabName));

  if (tabName === "context") {
    renderContextFileList();
    if (state.activeContextFile) {
      const file = state.contextFiles.find((f) => f.name === state.activeContextFile);
      setEditorValue(file ? file.content : "");
      setEditorPlaceholder(file?.isReadOnly ? "Read-only PDF — extracted text" : "Start editing...");
    } else {
      setEditorValue("");
      setEditorPlaceholder("Select a context file...");
    }
  } else {
    renderContextFileList();
    setEditorReadOnly(false);
    setEditorValue(state.tabContents[tabName] || "");
    setEditorPlaceholder("Start editing...");
  }
  state.cmView.focus();
  updateTokenCounter();
  updateInstructionsVisibility();
}

export function updateTokenCounter() {
  const count = Math.ceil(getEditorValue().length / 4);
  dom.tokenCounter.textContent = count === 1 ? "1 token" : `${count} tokens`;
}
