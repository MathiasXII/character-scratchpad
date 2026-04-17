const { invoke } = window.__TAURI__;

import { dom, state } from "./app.js";
import { loadCharacters } from "./characters.js";
import { updateTokenCounter } from "./editor.js";

export function openSettingsModal() {
  dom.settingsModal.classList.remove("hidden");
}

export function closeSettingsModal() {
  dom.settingsModal.classList.add("hidden");
}

export function loadSettingsFromStorage() {
  dom.apiKeyInput.value = localStorage.getItem("llm-api-key") || "";
  dom.modelInput.value = localStorage.getItem("llm-model") || "gpt-4o-mini";
  dom.endpointInput.value =
    localStorage.getItem("llm-endpoint") || "https://api.openai.com/v1/chat/completions";
  dom.workFolderInput.value = localStorage.getItem("llm-work-folder") || "";
  state.currentWorkFolder = dom.workFolderInput.value;
}

export async function syncSettingsToBackend() {
  const settings = {
    apiKey: dom.apiKeyInput.value,
    model: dom.modelInput.value,
    endpoint: dom.endpointInput.value,
  };

  try {
    await invoke("update_settings", { settings });
  } catch (error) {
    console.error("Failed to sync settings:", error);
  }
}

export async function handleSaveSettings() {
  localStorage.setItem("llm-api-key", dom.apiKeyInput.value);
  localStorage.setItem("llm-model", dom.modelInput.value);
  localStorage.setItem("llm-endpoint", dom.endpointInput.value);
  localStorage.setItem("llm-work-folder", dom.workFolderInput.value);

  await syncSettingsToBackend();
  closeSettingsModal();

  if (dom.workFolderInput.value !== state.currentWorkFolder) {
    state.currentWorkFolder = dom.workFolderInput.value;
    state.selectedCharacter = "";
    for (const key in state.tabContents) {
      state.tabContents[key] = "";
    }
    dom.editor.value = "";
    dom.editor.placeholder = "Select a character to start editing...";
    updateTokenCounter();
    await loadCharacters();
  }
}
