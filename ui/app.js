const { invoke } = window.__TAURI__;
const { listen } = window.__TAURI__.event;
const { open } = window.__TAURI__.dialog;

// --- State ---
let conversationHistory = [];
let isStreaming = false;
let currentAssistantEl = null;
let currentAssistantContent = "";

// --- Editor Tab State ---
const tabContents = {
  instructions: "",
  prompt: "",
  description: "",
  "first-response": "",
};
let activeTab = "instructions";

// --- Character State ---
let currentWorkFolder = "";
let selectedCharacter = "";
let saveTimeout = null;
let isLoadingCharacter = false;

// --- DOM ---
const messagesEl = document.getElementById("messages");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const settingsBtn = document.getElementById("settings-btn");
const settingsModal = document.getElementById("settings-modal");
const settingsClose = document.getElementById("settings-close");
const saveSettingsBtn = document.getElementById("save-settings");
const apiKeyInput = document.getElementById("api-key");
const modelInput = document.getElementById("model");
const endpointInput = document.getElementById("endpoint");

// --- Editor DOM ---
const editor = document.getElementById("editor");
const tabs = document.querySelectorAll("#tab-bar .tab");
const tokenCounter = document.getElementById("token-counter");

// --- Character DOM ---
const characterSelect = document.getElementById("character-select");
const newCharacterBtn = document.getElementById("new-character-btn");
const newCharacterModal = document.getElementById("new-character-modal");
const newCharacterNameInput = document.getElementById("new-character-name");
const newCharacterClose = document.getElementById("new-character-close");
const newCharacterCancel = document.getElementById("new-character-cancel");
const newCharacterCreate = document.getElementById("new-character-create");
const workFolderInput = document.getElementById("work-folder");
const browseFolderBtn = document.getElementById("browse-folder-btn");

// --- Save Error Banner DOM ---
const saveErrorBanner = document.getElementById("save-error-banner");
const saveErrorText = document.getElementById("save-error-text");
const saveErrorDismiss = document.getElementById("save-error-dismiss");

// --- Init ---
async function init() {
  loadSettingsFromStorage();
  await syncSettingsToBackend();
  showWelcome();
  initPaneDivider();
  await loadCharacters();

  // Event listeners
  listen("stream-token", (event) => {
    currentAssistantContent += event.payload;
    if (currentAssistantEl) {
      currentAssistantEl.querySelector(".content").textContent = currentAssistantContent;
      scrollToBottom();
    }
  });

  listen("stream-end", () => {
    if (currentAssistantEl) {
      currentAssistantEl.classList.remove("streaming");
    }
    conversationHistory.push({ role: "assistant", content: currentAssistantContent });
    isStreaming = false;
    sendBtn.disabled = false;
    currentAssistantEl = null;
    currentAssistantContent = "";
  });

  listen("stream-error", (event) => {
    addErrorMessage(event.payload);
    isStreaming = false;
    sendBtn.disabled = false;
    currentAssistantEl = null;
    currentAssistantContent = "";
  });

  sendBtn.addEventListener("click", handleSend);
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  userInput.addEventListener("input", autoResizeInput);

  settingsBtn.addEventListener("click", () => settingsModal.classList.remove("hidden"));
  settingsClose.addEventListener("click", () => settingsModal.classList.add("hidden"));
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) settingsModal.classList.add("hidden");
  });

  saveSettingsBtn.addEventListener("click", handleSaveSettings);

  // --- Browse folder ---
  browseFolderBtn.addEventListener("click", async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      workFolderInput.value = selected;
    }
  });

  // --- New character ---
  newCharacterBtn.addEventListener("click", openNewCharacterModal);
  newCharacterClose.addEventListener("click", closeNewCharacterModal);
  newCharacterCancel.addEventListener("click", closeNewCharacterModal);
  newCharacterModal.addEventListener("click", (e) => {
    if (e.target === newCharacterModal) closeNewCharacterModal();
  });
  newCharacterCreate.addEventListener("click", handleCreateCharacter);
  newCharacterNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleCreateCharacter();
    newCharacterNameInput.style.borderColor = "";
  });

  // --- Character selection ---
  characterSelect.addEventListener("change", handleCharacterSelect);

  // --- Save error banner ---
  saveErrorDismiss.addEventListener("click", hideSaveError);

  // --- Tab switching ---
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });
  // Initialize editor with default tab content
  editor.value = tabContents[activeTab];
  updateTokenCounter();

  // Update token counter on every input + debounced auto-save
  editor.addEventListener("input", () => {
    updateTokenCounter();
    if (!isLoadingCharacter && selectedCharacter) {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(saveCurrentTab, 1000);
    }
  });
}

// --- Chat Logic ---
async function handleSend() {
  const text = userInput.value.trim();
  if (!text || isStreaming) return;

  // Remove welcome message if present
  const welcome = messagesEl.querySelector(".welcome");
  if (welcome) welcome.remove();

  addMessage("user", text);
  conversationHistory.push({ role: "user", content: text });

  userInput.value = "";
  autoResizeInput();
  isStreaming = true;
  sendBtn.disabled = true;

  // Create assistant message bubble for streaming
  currentAssistantEl = createMessageElement("assistant", "");
  currentAssistantEl.classList.add("streaming");
  messagesEl.appendChild(currentAssistantEl);
  currentAssistantContent = "";
  scrollToBottom();

  try {
    await invoke("send_message_stream", { messages: conversationHistory });
  } catch (err) {
    if (currentAssistantEl) {
      currentAssistantEl.remove();
    }
    addErrorMessage(typeof err === "string" ? err : String(err));
    isStreaming = false;
    sendBtn.disabled = false;
    currentAssistantEl = null;
    currentAssistantContent = "";
  }
}

// --- DOM Helpers ---
function createMessageElement(role, content) {
  const el = document.createElement("div");
  el.className = `message ${role}`;

  const label = document.createElement("div");
  label.className = "role-label";
  label.textContent = role === "user" ? "You" : "Assistant";

  const body = document.createElement("div");
  body.className = "content";
  body.textContent = content;

  el.appendChild(label);
  el.appendChild(body);
  return el;
}

function addMessage(role, content) {
  const el = createMessageElement(role, content);
  messagesEl.appendChild(el);
  scrollToBottom();
}

function addErrorMessage(text) {
  const el = document.createElement("div");
  el.className = "message error";
  el.textContent = text;
  messagesEl.appendChild(el);
  scrollToBottom();
}

function scrollToBottom() {
  const container = document.getElementById("chat-container");
  container.scrollTop = container.scrollHeight;
}

function autoResizeInput() {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + "px";
}

function showWelcome() {
  const el = document.createElement("div");
  el.className = "welcome";
  el.innerHTML = `
    <h2>Welcome to LLM Chat</h2>
    <p>Click the gear icon to configure your API key and endpoint,<br>then start chatting.</p>
  `;
  messagesEl.appendChild(el);
}

// --- Settings ---
function loadSettingsFromStorage() {
  apiKeyInput.value = localStorage.getItem("llm-api-key") || "";
  modelInput.value = localStorage.getItem("llm-model") || "gpt-4o-mini";
  endpointInput.value =
    localStorage.getItem("llm-endpoint") || "https://api.openai.com/v1/chat/completions";
  workFolderInput.value = localStorage.getItem("llm-work-folder") || "";
  currentWorkFolder = workFolderInput.value;
}

async function syncSettingsToBackend() {
  const settings = {
    apiKey: apiKeyInput.value,
    model: modelInput.value,
    endpoint: endpointInput.value,
  };
  try {
    await invoke("update_settings", { settings });
  } catch (e) {
    console.error("Failed to sync settings:", e);
  }
}

async function handleSaveSettings() {
  localStorage.setItem("llm-api-key", apiKeyInput.value);
  localStorage.setItem("llm-model", modelInput.value);
  localStorage.setItem("llm-endpoint", endpointInput.value);
  localStorage.setItem("llm-work-folder", workFolderInput.value);

  await syncSettingsToBackend();
  settingsModal.classList.add("hidden");

  // Reload characters if work folder changed
  if (workFolderInput.value !== currentWorkFolder) {
    currentWorkFolder = workFolderInput.value;
    selectedCharacter = "";
    for (const key in tabContents) {
      tabContents[key] = "";
    }
    editor.value = "";
    editor.placeholder = "Select a character to start editing...";
    updateTokenCounter();
    await loadCharacters();
  }
}

// --- Pane Divider ---
function initPaneDivider() {
  const divider = document.getElementById("pane-divider");
  const leftPane = document.getElementById("left-pane");
  const mainEl = document.querySelector("main");

  // Set initial 40/60 split
  const totalWidth = mainEl.offsetWidth;
  const dividerWidth = divider.offsetWidth;
  const leftWidth = Math.round((totalWidth - dividerWidth) * (6 / 11));
  leftPane.style.width = leftWidth + "px";

  let isDragging = false;

  divider.addEventListener("mousedown", (e) => {
    e.preventDefault();
    isDragging = true;
    divider.classList.add("active");
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const rect = mainEl.getBoundingClientRect();
    const dividerWidth = divider.offsetWidth;
    const minPaneWidth = 250;
    const maxLeft = rect.width - dividerWidth - minPaneWidth;
    const minLeft = minPaneWidth;

    let newLeftWidth = e.clientX - rect.left;
    newLeftWidth = Math.max(minLeft, Math.min(maxLeft, newLeftWidth));

    leftPane.style.width = newLeftWidth + "px";
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    divider.classList.remove("active");
    document.body.style.userSelect = "";
    document.body.style.webkitUserSelect = "";
  });
}

// --- Character List ---
async function loadCharacters() {
  characterSelect.innerHTML = "";
  characterSelect.disabled = true;

  if (!currentWorkFolder) {
    const opt = document.createElement("option");
    opt.textContent = "Set work folder in Settings";
    opt.value = "";
    characterSelect.appendChild(opt);
    return;
  }

  try {
    const characters = await invoke("list_characters", { workFolder: currentWorkFolder });

    if (characters.length === 0) {
      const opt = document.createElement("option");
      opt.textContent = "No characters yet";
      opt.value = "";
      characterSelect.appendChild(opt);
    } else {
      const placeholder = document.createElement("option");
      placeholder.textContent = "Select a character...";
      placeholder.value = "";
      characterSelect.appendChild(placeholder);

      for (const name of characters) {
        const opt = document.createElement("option");
        opt.textContent = name;
        opt.value = name;
        characterSelect.appendChild(opt);
      }
      characterSelect.disabled = false;
    }
  } catch (e) {
    const opt = document.createElement("option");
    opt.textContent = "Error loading characters";
    opt.value = "";
    characterSelect.appendChild(opt);
    console.error("Failed to load characters:", e);
  }
}

// --- New Character ---
function openNewCharacterModal() {
  if (!currentWorkFolder) {
    openSettingsModal();
    return;
  }
  newCharacterNameInput.value = "";
  newCharacterNameInput.style.borderColor = "";
  newCharacterModal.classList.remove("hidden");
  newCharacterNameInput.focus();
}

function closeNewCharacterModal() {
  newCharacterModal.classList.add("hidden");
}

async function handleCreateCharacter() {
  const name = newCharacterNameInput.value.trim();
  if (!name) {
    newCharacterNameInput.style.borderColor = "var(--error)";
    newCharacterNameInput.focus();
    return;
  }

  newCharacterCreate.disabled = true;
  try {
    await invoke("create_character", { workFolder: currentWorkFolder, name });
    await loadCharacters();
    characterSelect.value = name;
    await handleCharacterSelect();
    closeNewCharacterModal();
  } catch (e) {
    newCharacterNameInput.style.borderColor = "var(--error)";
    newCharacterNameInput.value = "";
    newCharacterNameInput.placeholder = typeof e === "string" ? e : String(e);
    newCharacterNameInput.focus();
  } finally {
    newCharacterCreate.disabled = false;
  }
}

// --- Character File Loading ---
async function handleCharacterSelect() {
  const name = characterSelect.value;

  // Cancel any pending save
  clearTimeout(saveTimeout);
  saveTimeout = null;

  if (!name) {
    selectedCharacter = "";
    for (const key in tabContents) {
      tabContents[key] = "";
    }
    editor.value = "";
    editor.placeholder = "Select a character to start editing...";
    updateTokenCounter();
    return;
  }

  selectedCharacter = name;
  isLoadingCharacter = true;

  const charDir = currentWorkFolder + "/" + name;
  const fileEntries = [
    ["instructions", charDir + "/instructions.md"],
    ["prompt", charDir + "/prompt.md"],
    ["description", charDir + "/description.md"],
    ["first-response", charDir + "/first-response.md"],
  ];

  const results = await Promise.all(
    fileEntries.map(([key, path]) =>
      invoke("load_file", { path })
        .then((content) => ({ key, content }))
        .catch((err) => {
          console.error(`Failed to load ${key}:`, err);
          return { key, content: "" };
        })
    )
  );

  for (const { key, content } of results) {
    tabContents[key] = content;
  }

  // Update editor with current active tab
  editor.value = tabContents[activeTab];
  editor.placeholder = "Start editing...";
  updateTokenCounter();
  isLoadingCharacter = false;
}

// --- Auto-Save ---
async function saveCurrentTab() {
  if (!selectedCharacter || isLoadingCharacter) return;

  tabContents[activeTab] = editor.value;
  const filename = activeTab + ".md";
  const path = currentWorkFolder + "/" + selectedCharacter + "/" + filename;

  try {
    await invoke("save_file", { path, content: tabContents[activeTab] });
    hideSaveError();
  } catch (e) {
    showSaveError("Save failed: " + (typeof e === "string" ? e : String(e)));
  }
}

// --- Save Error Banner ---
function showSaveError(message) {
  saveErrorText.textContent = message;
  saveErrorBanner.classList.remove("hidden");
}

function hideSaveError() {
  saveErrorBanner.classList.add("hidden");
}

// --- Tab Switching ---
function switchTab(tabName) {
  if (tabName === activeTab) return;

  // Save current editor content to the previously active tab
  tabContents[activeTab] = editor.value;

  // Cancel pending debounced save and force-save old tab content
  clearTimeout(saveTimeout);
  saveTimeout = null;
  if (selectedCharacter && !isLoadingCharacter) {
    const oldTab = activeTab;
    const filename = oldTab + ".md";
    const path = currentWorkFolder + "/" + selectedCharacter + "/" + filename;
    invoke("save_file", { path, content: tabContents[oldTab] })
      .then(() => hideSaveError())
      .catch((e) => showSaveError("Save failed: " + (typeof e === "string" ? e : String(e))));
  }

  // Update active tab
  activeTab = tabName;
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tabName));

  // Load the new tab's content into the editor
  editor.value = tabContents[tabName];
  editor.focus();
  updateTokenCounter();
}

// --- Token Counter ---
function updateTokenCounter() {
  const count = Math.ceil(editor.value.length / 4);
  tokenCounter.textContent = count === 1 ? "1 token" : `${count} tokens`;
}

// --- Boot ---
init();
