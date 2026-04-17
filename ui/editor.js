const { invoke } = window.__TAURI__;

import { dom, state } from "./app.js";
import { checkDirty } from "./git.js";

export async function saveCurrentTab() {
  if (!state.selectedCharacter || state.isLoadingCharacter) {
    return;
  }

  state.tabContents[state.activeTab] = dom.editor.value;
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

  state.tabContents[state.activeTab] = dom.editor.value;

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

  dom.editor.value = state.tabContents[tabName];
  dom.editor.focus();
  updateTokenCounter();
}

export function updateTokenCounter() {
  const count = Math.ceil(dom.editor.value.length / 4);
  dom.tokenCounter.textContent = count === 1 ? "1 token" : `${count} tokens`;
}
