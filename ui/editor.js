const { invoke } = window.__TAURI__.core;

import { dom, state, TAB_FILE_MAP } from "./app.js";
import { getRepoPath, formatError } from "./helpers.js";
import { checkDirty } from "./git.js";
import { renderContextFileList, saveActiveContextFile } from "./context.js";

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

/**
 * Persist a tab file to disk, update lastSavedContent, and refresh dirty state.
 * Returns a Promise — callers may await it or fire-and-forget.
 * On success: updates lastSavedContent, hides the save-error banner, and checks dirty state.
 * On failure: shows the save-error banner.
 */
function persistTabFile(tab, content) {
  const filename = TAB_FILE_MAP[tab];
  const path = getRepoPath(state) + "/" + filename;
  return Promise.resolve(invoke("save_file", { path, content }))
    .then(() => {
      state.lastSavedContent[tab] = content;
      hideSaveError();
      checkDirty();
    })
    .catch((error) => {
      showSaveError("Save failed: " + formatError(error));
    });
}

export async function saveCurrentTab() {
  const tab = state.activeTab;

  if (tab === "context") {
    try {
      const saved = await saveActiveContextFile();
      if (saved) {
        hideSaveError();
        checkDirty();
      }
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

  await persistTabFile(tab, content);
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
  if (state.activeTab === "context") {
    try {
      const saved = await saveActiveContextFile();
      if (saved) hideSaveError();
    } catch (error) {
      showSaveError("Save failed: " + formatError(error));
    }
  }

  if (state.selectedCharacter && !state.isLoadingCharacter && state.activeTab !== "context") {
    const oldTab = state.activeTab;
    const content = state.tabContents[oldTab];

    // Only save if content actually changed
    if (content !== state.lastSavedContent[oldTab]) {
      persistTabFile(oldTab, content);
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
