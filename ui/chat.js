const { invoke } = window.__TAURI__;
const { listen } = window.__TAURI__.event;

import { dom, state } from "./app.js";

export function initStreamListeners() {
  listen("stream-token", (event) => {
    state.currentAssistantContent += event.payload;
    if (state.currentAssistantEl) {
      state.currentAssistantEl.querySelector(".content").textContent = state.currentAssistantContent;
      scrollToBottom();
    }
  });

  listen("stream-end", () => {
    if (state.currentAssistantEl) {
      state.currentAssistantEl.classList.remove("streaming");
    }
    state.conversationHistory.push({ role: "assistant", content: state.currentAssistantContent });
    state.isStreaming = false;
    dom.sendBtn.disabled = false;
    state.currentAssistantEl = null;
    state.currentAssistantContent = "";
  });

  listen("stream-error", (event) => {
    addErrorMessage(event.payload);
    state.isStreaming = false;
    dom.sendBtn.disabled = false;
    state.currentAssistantEl = null;
    state.currentAssistantContent = "";
  });
}

export async function handleSend() {
  const text = dom.userInput.value.trim();
  if (!text || state.isStreaming) {
    return;
  }

  const welcome = dom.messagesEl.querySelector(".welcome");
  if (welcome) {
    welcome.remove();
  }

  addMessage("user", text);
  state.conversationHistory.push({ role: "user", content: text });

  dom.userInput.value = "";
  autoResizeInput();
  state.isStreaming = true;
  dom.sendBtn.disabled = true;

  state.currentAssistantEl = createMessageElement("assistant", "");
  state.currentAssistantEl.classList.add("streaming");
  dom.messagesEl.appendChild(state.currentAssistantEl);
  state.currentAssistantContent = "";
  scrollToBottom();

  try {
    await invoke("send_message_stream", { messages: state.conversationHistory });
  } catch (err) {
    if (state.currentAssistantEl) {
      state.currentAssistantEl.remove();
    }
    addErrorMessage(typeof err === "string" ? err : String(err));
    state.isStreaming = false;
    dom.sendBtn.disabled = false;
    state.currentAssistantEl = null;
    state.currentAssistantContent = "";
  }
}

export function createMessageElement(role, content) {
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

export function addMessage(role, content) {
  const el = createMessageElement(role, content);
  dom.messagesEl.appendChild(el);
  scrollToBottom();
}

export function addErrorMessage(text) {
  const el = document.createElement("div");
  el.className = "message error";
  el.textContent = text;
  dom.messagesEl.appendChild(el);
  scrollToBottom();
}

export function scrollToBottom() {
  dom.chatContainer.scrollTop = dom.chatContainer.scrollHeight;
}

export function autoResizeInput() {
  dom.userInput.style.height = "auto";
  dom.userInput.style.height = Math.min(dom.userInput.scrollHeight, 120) + "px";
}

export function showWelcome() {
  const el = document.createElement("div");
  el.className = "welcome";
  el.innerHTML = `
    <h2>Welcome to LLM Chat</h2>
    <p>Click the gear icon to configure your API key and endpoint,<br>then start chatting.</p>
  `;
  dom.messagesEl.appendChild(el);
}
