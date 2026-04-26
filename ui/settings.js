const { invoke } = window.__TAURI__.core;

import { dom, state, updateUIState } from "./app.js";
import { loadCharacters } from "./characters.js";
import { setEditorValue, setEditorPlaceholder, updateTokenCounter } from "./editor.js";

let lastFetchedBaseUrl = "";
let lastFetchedApiKey = "";
let allModels = [];

/**
 * Normalizes an endpoint URL into a clean base URL.
 * Mirrors the Rust `normalize_endpoint` logic so the user sees
 * the corrected value immediately on blur.
 *
 * Strategy:
 * 1. Strip leading/trailing slashes from the input.
 * 2. Find the LAST version segment (/v1, /v2, /v1beta, etc.)
 *    and truncate everything after it.
 * 3. If no version segment, fall back to stripping known API suffixes.
 */
export function normalizeEndpoint(endpoint) {
  let result = endpoint.replace(/^\/+|\/+$/g, "");

  // Find the last version segment: /v followed by a digit
  const matches = [...result.matchAll(/\/v(\d)/g)];
  if (matches.length > 0) {
    const last = matches[matches.length - 1];
    const segStart = last.index;
    // Find the end of the version segment (e.g. "/v1beta")
    const afterV = result.slice(segStart + 2);
    const versionEnd = afterV.search("/");
    const segEnd = versionEnd === -1 ? result.length : segStart + 2 + versionEnd;
    return result.slice(0, segEnd);
  }

  // Fallback: no version segment — strip known API suffixes
  const suffixes = [
    "/chat/completions",
    "/completions",
    "/models",
    "/embeddings",
    "/images/generations",
    "/audio/transcriptions",
    "/audio/translations",
    "/audio/speech",
    "/moderations",
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of suffixes) {
      if (result.endsWith(suffix)) {
        result = result.slice(0, -suffix.length);
        changed = true;
        break;
      }
    }
  }

  // Strip trailing slashes left by suffix removal
  result = result.replace(/\/+$/, "");
  return result;
}

/** Applies endpoint normalization to the input field in-place. */
export function applyEndpointNormalization() {
  const input = dom.endpointInput;
  const raw = input.value.trim();
  if (!raw) return;
  const normalized = normalizeEndpoint(raw);
  if (normalized !== raw) {
    input.value = normalized;
  }
}

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

export async function testConnection() {
  const baseUrl = dom.endpointInput.value.trim();
  const apiKey = dom.apiKeyInput.value.trim();
  const btn = dom.testConnectionBtn;

  clearFieldError(dom.endpointInput);
  clearFieldError(dom.apiKeyInput);
  resetTestBtn(btn);

  if (!baseUrl || !apiKey) {
    btn.textContent = "✗";
    btn.classList.add("error");
    if (!baseUrl) setFieldError(dom.endpointInput);
    if (!apiKey) setFieldError(dom.apiKeyInput);
    return;
  }

  btn.textContent = "...";
  btn.disabled = true;

  try {
    const result = await invoke("test_connection", { baseUrl, apiKey });

    if (result.success) {
      btn.textContent = "✓";
      btn.classList.add("success");
    } else {
      btn.textContent = "✗";
      btn.classList.add("error");

      const errorType = result.error_type || "";
      if (errorType === "connection" || errorType === "endpoint") {
        setFieldError(dom.endpointInput);
      } else if (errorType === "auth") {
        setFieldError(dom.apiKeyInput);
      } else {
        // Generic server error — highlight endpoint as the likely culprit
        setFieldError(dom.endpointInput);
      }
    }
  } catch {
    btn.textContent = "✗";
    btn.classList.add("error");
    setFieldError(dom.endpointInput);
  } finally {
    btn.disabled = false;
  }
}

export async function testModel() {
  const baseUrl = dom.endpointInput.value.trim();
  const apiKey = dom.apiKeyInput.value.trim();
  const model = dom.modelInput.value.trim();
  const btn = dom.testModelBtn;

  clearFieldError(dom.modelInput);
  resetTestBtn(btn);

  if (!baseUrl || !apiKey || !model) {
    btn.textContent = "✗";
    btn.classList.add("error");
    if (!model) setFieldError(dom.modelInput);
    if (!baseUrl) setFieldError(dom.endpointInput);
    if (!apiKey) setFieldError(dom.apiKeyInput);
    return;
  }

  btn.textContent = "...";
  btn.disabled = true;

  try {
    const result = await invoke("test_model", { baseUrl, apiKey, model });

    if (result.success) {
      btn.textContent = "✓";
      btn.classList.add("success");
    } else {
      btn.textContent = "✗";
      btn.classList.add("error");

      const errorType = result.error_type || "";
      if (errorType === "model_not_found") {
        setFieldError(dom.modelInput);
      } else if (errorType === "auth") {
        setFieldError(dom.apiKeyInput);
      } else if (errorType === "connection" || errorType === "endpoint") {
        setFieldError(dom.endpointInput);
      } else {
        setFieldError(dom.modelInput);
      }
    }
  } catch {
    btn.textContent = "✗";
    btn.classList.add("error");
    setFieldError(dom.modelInput);
  } finally {
    btn.disabled = false;
  }
}

function setFieldError(input) {
  input.classList.add("field-error");
}

function clearFieldError(input) {
  input.classList.remove("field-error");
}

function resetTestBtn(btn) {
  btn.textContent = "Test";
  btn.classList.remove("success", "error");
}

export function clearTestResults() {
  resetTestBtn(dom.testConnectionBtn);
  resetTestBtn(dom.testModelBtn);
  clearFieldError(dom.endpointInput);
  clearFieldError(dom.apiKeyInput);
  clearFieldError(dom.modelInput);
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
