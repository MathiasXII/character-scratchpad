const { invoke } = window.__TAURI__;

import { dom, state, TAB_FILE_MAP } from "./app.js";
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

export { getEditorValue, setEditorValue, setEditorPlaceholder };

export async function saveCurrentTab() {
  const tab = state.activeTab;

  if (tab === "context") {
    if (!state.activeContextFile || !state.selectedCharacter || state.isLoadingCharacter) return;
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
      showSaveError("Save failed: " + (typeof error === "string" ? error : String(error)));
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
  const path = state.currentWorkFolder + "/" + state.selectedCharacter + "/" + filename;

  try {
    await invoke("save_file", { path, content });
    state.lastSavedContent[tab] = content;
    hideSaveError();
    checkDirty();
  } catch (error) {
    showSaveError("Save failed: " + (typeof error === "string" ? error : String(error)));
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
    const content = getEditorValue();
    if (content !== state.contextLastSaved[state.activeContextFile]) {
      const path = state.currentWorkFolder + "/" + state.selectedCharacter + "/context/" + state.activeContextFile;
      try {
        await invoke("save_file", { path, content });
        state.contextLastSaved[state.activeContextFile] = content;
        const file = state.contextFiles.find(f => f.name === state.activeContextFile);
        if (file) file.content = content;
        hideSaveError();
      } catch (error) {
        showSaveError("Save failed: " + (typeof error === "string" ? error : String(error)));
      }
    }
  }

  if (state.selectedCharacter && !state.isLoadingCharacter && state.activeTab !== "context") {
    const oldTab = state.activeTab;
    const content = state.tabContents[oldTab];

    // Only save if content actually changed
    if (content !== state.lastSavedContent[oldTab]) {
      const filename = TAB_FILE_MAP[oldTab];
      const path = state.currentWorkFolder + "/" + state.selectedCharacter + "/" + filename;
      invoke("save_file", { path, content })
        .then(() => {
          state.lastSavedContent[oldTab] = content;
          hideSaveError();
          checkDirty();
        })
        .catch((error) =>
          showSaveError("Save failed: " + (typeof error === "string" ? error : String(error)))
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
      setEditorPlaceholder(file ? "Start editing..." : "Select a context file...");
    } else {
      setEditorValue("");
      setEditorPlaceholder("Select a context file...");
    }
  } else {
    renderContextFileList();
    setEditorValue(state.tabContents[tabName] || "");
    setEditorPlaceholder("Start editing...");
  }
  state.cmView.focus();
  updateTokenCounter();
}

export function updateTokenCounter() {
  const count = Math.ceil(getEditorValue().length / 4);
  dom.tokenCounter.textContent = count === 1 ? "1 token" : `${count} tokens`;
}
