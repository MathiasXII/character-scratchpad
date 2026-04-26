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

function setFieldError(input, hasError) {
  input.classList[hasError ? "add" : "remove"]("field-error");
}

function clearFieldError(input) {
  setFieldError(input, false);
}

function setTestButtonState(btn, state) {
  btn.textContent = state === "pending" ? "..." : state === "success" ? "✓" : state === "error" ? "✗" : "Test";
  btn.classList.remove("success", "error");
  if (state === "success") btn.classList.add("success");
  if (state === "error") btn.classList.add("error");
  btn.disabled = state === "pending";
}

function setSettingsInputs(settings) {
  dom.apiKeyInput.value = settings.apiKey || "";
  dom.modelInput.value = settings.model || "gpt-4o-mini";
  dom.endpointInput.value = settings.endpoint || "https://api.openai.com/v1";
  dom.temperatureInput.value = String(settings.temperature ?? 0.7);
  dom.topPInput.value = String(settings.topP ?? 1.0);
}

function applySettingsSnapshot({ workFolder } = {}) {
  dom.temperatureValue.textContent = dom.temperatureInput.value;
  dom.topPValue.textContent = dom.topPInput.value;
  if (workFolder !== undefined) {
    dom.workFolderInput.value = workFolder;
    state.currentWorkFolder = workFolder;
  }
}

async function loadSettingsSnapshot(settings, workFolder) {
  setSettingsInputs(settings);
  applySettingsSnapshot({ workFolder });
  await fetchModels();
}

function validateRequiredInputs(requiredInputs, btn) {
  let hasMissing = false;
  for (const input of requiredInputs) {
    const isMissing = !input.value.trim();
    setFieldError(input, isMissing);
    hasMissing ||= isMissing;
  }

  if (hasMissing) {
    setTestButtonState(btn, "error");
    return false;
  }

  return true;
}

function markTestFailure(btn, field) {
  setTestButtonState(btn, "error");
  setFieldError(field, true);
}

function markTestSuccess(btn) {
  setTestButtonState(btn, "success");
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

async function fetchModels() {
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

function renderModelDropdown(filter = "") {
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
  setTestButtonState(btn, "idle");

  if (!validateRequiredInputs([dom.endpointInput, dom.apiKeyInput], btn)) {
    return;
  }

  setTestButtonState(btn, "pending");

  try {
    const result = await invoke("test_connection", { baseUrl, apiKey });

    if (result.success) {
      markTestSuccess(btn);
    } else {
      const errorType = result.error_type || "";
      if (errorType === "connection" || errorType === "endpoint") {
        markTestFailure(btn, dom.endpointInput);
      } else if (errorType === "auth") {
        markTestFailure(btn, dom.apiKeyInput);
      } else {
        // Generic server error — highlight endpoint as the likely culprit
        markTestFailure(btn, dom.endpointInput);
      }
    }
  } catch {
    markTestFailure(btn, dom.endpointInput);
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
  setTestButtonState(btn, "idle");

  if (!validateRequiredInputs([dom.endpointInput, dom.apiKeyInput, dom.modelInput], btn)) {
    if (!model) setFieldError(dom.modelInput, true);
    return;
  }

  setTestButtonState(btn, "pending");

  try {
    const result = await invoke("test_model", { baseUrl, apiKey, model });

    if (result.success) {
      markTestSuccess(btn);
    } else {
      const errorType = result.error_type || "";
      if (errorType === "model_not_found") {
        markTestFailure(btn, dom.modelInput);
      } else if (errorType === "auth") {
        markTestFailure(btn, dom.apiKeyInput);
      } else if (errorType === "connection" || errorType === "endpoint") {
        markTestFailure(btn, dom.endpointInput);
      } else {
        markTestFailure(btn, dom.modelInput);
      }
    }
  } catch {
    markTestFailure(btn, dom.modelInput);
  } finally {
    btn.disabled = false;
  }
}

export function clearTestResults() {
  setTestButtonState(dom.testConnectionBtn, "idle");
  setTestButtonState(dom.testModelBtn, "idle");
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
  await loadSettingsSnapshot(settings, localStorage.getItem("llm-work-folder") || "");
}

export async function loadSettingsFromStorage() {
  await loadSettingsSnapshot({
    apiKey: localStorage.getItem("llm-api-key") || "",
    model: localStorage.getItem("llm-model") || "gpt-4o-mini",
    endpoint: localStorage.getItem("llm-endpoint") || "https://api.openai.com/v1",
    temperature: localStorage.getItem("llm-temperature") || "0.7",
    topP: localStorage.getItem("llm-top-p") || "1.0",
  }, localStorage.getItem("llm-work-folder") || "");
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
