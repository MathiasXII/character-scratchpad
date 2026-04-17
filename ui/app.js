const { invoke } = window.__TAURI__;
const { listen } = window.__TAURI__.event;

// --- State ---
let conversationHistory = [];
let isStreaming = false;
let currentAssistantEl = null;
let currentAssistantContent = "";

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

// --- Init ---
async function init() {
  loadSettingsFromStorage();
  await syncSettingsToBackend();
  showWelcome();
  initPaneDivider();

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

  await syncSettingsToBackend();
  settingsModal.classList.add("hidden");
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

// --- Boot ---
init();
