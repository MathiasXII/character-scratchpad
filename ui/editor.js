const { invoke } = window.__TAURI__;

import { dom, state } from "./app.js";
import { checkDirty } from "./git.js";

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
  if (!state.selectedCharacter || state.isLoadingCharacter) {
    return;
  }

  state.tabContents[state.activeTab] = getEditorValue();
  const filename = state.activeTab + ".md";
  const path = state.currentWorkFolder + "/" + state.selectedCharacter + "/" + filename;

  try {
    await invoke("save_file", { path, content: state.tabContents[state.activeTab] });
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

export function switchTab(tabName) {
  if (tabName === state.activeTab) {
    return;
  }

  state.tabContents[state.activeTab] = getEditorValue();

  clearTimeout(state.saveTimeout);
  state.saveTimeout = null;
  if (state.selectedCharacter && !state.isLoadingCharacter) {
    const oldTab = state.activeTab;
    const filename = oldTab + ".md";
    const path = state.currentWorkFolder + "/" + state.selectedCharacter + "/" + filename;
    invoke("save_file", { path, content: state.tabContents[oldTab] })
      .then(() => { hideSaveError(); checkDirty(); })
      .catch((error) =>
        showSaveError("Save failed: " + (typeof error === "string" ? error : String(error)))
      );
  }

  state.activeTab = tabName;
  dom.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabName));

  setEditorValue(state.tabContents[tabName] || "");
  state.cmView.focus();
  updateTokenCounter();
}

export function updateTokenCounter() {
  const count = Math.ceil(getEditorValue().length / 4);
  dom.tokenCounter.textContent = count === 1 ? "1 token" : `${count} tokens`;
}
