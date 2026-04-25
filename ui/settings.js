const { invoke } = window.__TAURI__.core;

import { dom, state, updateUIState } from "./app.js";
import { loadCharacters } from "./characters.js";
import { setEditorValue, setEditorPlaceholder, updateTokenCounter } from "./editor.js";

let lastFetchedBaseUrl = "";
let lastFetchedApiKey = "";
let allModels = [];

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function sortModels(models) {
  const normal = [];
  const tee = [];
  const ee2e = [];

  for (const model of models) {
    if (model.startsWith("tee")) {
      tee.push(model);
    } else if (model.startsWith("ee2e")) {
      ee2e.push(model);
    } else {
      normal.push(model);
    }
  }

  normal.sort();
  tee.sort();
  ee2e.sort();

  return [...normal, ...tee, ...ee2e];
}

export async function fetchModels() {
  const baseUrl = dom.endpointInput.value.trim();
  const apiKey = dom.apiKeyInput.value.trim();

  if (baseUrl === lastFetchedBaseUrl && apiKey === lastFetchedApiKey) return;

  if (!baseUrl || !apiKey) {
    allModels = [];
    dom.modelDropdownBtn.disabled = true;
    dom.modelDropdown.innerHTML = "";
    return;
  }

  try {
    const models = await invoke("fetch_models", { baseUrl, apiKey });
    allModels = sortModels(models);
    dom.modelDropdownBtn.disabled = false;
    renderModelDropdown();
    lastFetchedBaseUrl = baseUrl;
    lastFetchedApiKey = apiKey;
  } catch {
    allModels = [];
    dom.modelDropdownBtn.disabled = true;
    dom.modelDropdown.innerHTML = "";
  }
}

export function renderModelDropdown(filter = "") {
  const dropdown = dom.modelDropdown;
  dropdown.innerHTML = "";

  const filtered = filter
    ? allModels.filter(m => m.toLowerCase().startsWith(filter.toLowerCase()))
    : [...allModels];

  if (filtered.length === 0) {
    dropdown.innerHTML = '<div class="combobox-option" style="opacity:0.5;pointer-events:none;">No models found</div>';
    return;
  }

  for (const model of filtered) {
    const div = document.createElement("div");
    div.className = "combobox-option";
    div.textContent = model;
    div.addEventListener("click", () => {
      dom.modelInput.value = model;
      dropdown.classList.add("hidden");
    });
    dropdown.appendChild(div);
  }
}

export function initModelCombobox() {
  const dropdownBtn = dom.modelDropdownBtn;
  const dropdown = dom.modelDropdown;
  const modelInput = dom.modelInput;

  dropdownBtn.addEventListener("click", () => {
    if (dropdownBtn.disabled) return;
    const isHidden = dropdown.classList.contains("hidden");
    if (isHidden) {
      renderModelDropdown(modelInput.value);
      dropdown.classList.remove("hidden");
    } else {
      dropdown.classList.add("hidden");
    }
  });

  modelInput.addEventListener("input", () => {
    if (allModels.length > 0) {
      renderModelDropdown(modelInput.value);
      dropdown.classList.remove("hidden");
    }
  });

  modelInput.addEventListener("focus", () => {
    // Do not auto-open on focus
  });

  modelInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      dropdown.classList.add("hidden");
    } else if (event.key === "ArrowDown") {
      if (dropdown.classList.contains("hidden")) {
        renderModelDropdown(modelInput.value);
        dropdown.classList.remove("hidden");
      }
    }
  });

  document.addEventListener("click", (event) => {
    const combobox = document.getElementById("model-combobox");
    if (combobox && !combobox.contains(event.target)) {
      dropdown.classList.add("hidden");
    }
  });
}

export const onEndpointOrKeyChange = debounce(fetchModels, 500);

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
  dom.endpointInput.value = settings.endpoint || "https://api.openai.com/v1";
  dom.temperatureInput.value = String(settings.temperature ?? 0.7);
  dom.topPInput.value = String(settings.topP ?? 1.0);
  dom.workFolderInput.value = localStorage.getItem("llm-work-folder") || "";
  dom.temperatureValue.textContent = dom.temperatureInput.value;
  dom.topPValue.textContent = dom.topPInput.value;
  state.currentWorkFolder = dom.workFolderInput.value;
  await fetchModels();
}

export async function loadSettingsFromStorage() {
  dom.apiKeyInput.value = localStorage.getItem("llm-api-key") || "";
  dom.modelInput.value = localStorage.getItem("llm-model") || "gpt-4o-mini";
  dom.endpointInput.value =
    localStorage.getItem("llm-endpoint") || "https://api.openai.com/v1";
  dom.temperatureInput.value = localStorage.getItem("llm-temperature") || "0.7";
  dom.topPInput.value = localStorage.getItem("llm-top-p") || "1.0";
  dom.temperatureValue.textContent = dom.temperatureInput.value;
  dom.topPValue.textContent = dom.topPInput.value;
  dom.workFolderInput.value = localStorage.getItem("llm-work-folder") || "";
  state.currentWorkFolder = dom.workFolderInput.value;
  await fetchModels();
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
