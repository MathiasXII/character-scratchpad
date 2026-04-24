const { invoke } = window.__TAURI__.core;

import { dom, state, updateUIState } from "./app.js";
import { loadCharacters } from "./characters.js";
import { setEditorValue, setEditorPlaceholder, updateTokenCounter } from "./editor.js";

export function openSettingsModal() {
  dom.settingsModal.classList.remove("hidden");
}

export function closeSettingsModal() {
  dom.settingsModal.classList.add("hidden");
}

export async function loadSettingsFromFile() {
  const settings = await invoke("get_settings");
  dom.apiKeyInput.value = settings.apiKey || "";
  dom.modelInput.value = settings.model || "gpt-4o-mini";
  dom.endpointInput.value = settings.endpoint || "https://api.openai.com/v1/chat/completions";
  dom.temperatureInput.value = String(settings.temperature ?? 0.7);
  dom.topPInput.value = String(settings.topP ?? 1.0);
  dom.workFolderInput.value = localStorage.getItem("llm-work-folder") || "";
  dom.temperatureValue.textContent = dom.temperatureInput.value;
  dom.topPValue.textContent = dom.topPInput.value;
  state.currentWorkFolder = dom.workFolderInput.value;
}

export function loadSettingsFromStorage() {
  dom.apiKeyInput.value = localStorage.getItem("llm-api-key") || "";
  dom.modelInput.value = localStorage.getItem("llm-model") || "gpt-4o-mini";
  dom.endpointInput.value =
    localStorage.getItem("llm-endpoint") || "https://api.openai.com/v1/chat/completions";
  dom.temperatureInput.value = localStorage.getItem("llm-temperature") || "0.7";
  dom.topPInput.value = localStorage.getItem("llm-top-p") || "1.0";
  dom.temperatureValue.textContent = dom.temperatureInput.value;
  dom.topPValue.textContent = dom.topPInput.value;
  dom.workFolderInput.value = localStorage.getItem("llm-work-folder") || "";
  state.currentWorkFolder = dom.workFolderInput.value;
}

export async function syncSettingsToBackend() {
  const settings = {
    apiKey: dom.apiKeyInput.value,
    model: dom.modelInput.value,
    endpoint: dom.endpointInput.value,
    temperature: parseFloat(dom.temperatureInput.value),
    topP: parseFloat(dom.topPInput.value),
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
  localStorage.setItem("llm-temperature", dom.temperatureInput.value);
  localStorage.setItem("llm-top-p", dom.topPInput.value);
  localStorage.setItem("llm-work-folder", dom.workFolderInput.value);

  await syncSettingsToBackend();
  updateUIState();
  closeSettingsModal();

  if (dom.workFolderInput.value !== state.currentWorkFolder) {
    state.currentWorkFolder = dom.workFolderInput.value;
    state.selectedCharacter = "";
    for (const key in state.tabContents) {
      state.tabContents[key] = "";
    }
    setEditorValue("");
    setEditorPlaceholder("Select a character to start editing...");
    updateTokenCounter();
    await loadCharacters();
  }
}
