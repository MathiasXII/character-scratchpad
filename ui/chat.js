const { invoke } = window.__TAURI__;
const { listen } = window.__TAURI__.event;

import { dom, state } from "./app.js";

export function initStreamListeners() {
  listen("stream-token", (event) => {
    state.currentAssistantContent += event.payload;
    if (state.currentAssistantEl) {
      state.currentAssistantEl.querySelector(".content").innerHTML = marked.parse(state.currentAssistantContent);
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
    dom.resendBtn.disabled = state.conversationHistory.length === 0;
    state.currentAssistantEl = null;
    state.currentAssistantContent = "";
  });

  listen("stream-error", (event) => {
    addErrorMessage(event.payload);
    state.isStreaming = false;
    dom.sendBtn.disabled = false;
    dom.resendBtn.disabled = state.conversationHistory.length === 0;
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

  const assistantIndex = state.conversationHistory.length;
  state.currentAssistantEl = createMessageElement("assistant", "", assistantIndex);
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

export function createMessageElement(role, content, index) {
  const el = document.createElement("div");
  el.className = `message ${role}`;
  if (index !== undefined) {
    el.dataset.index = index;
  }

  const label = document.createElement("div");
  label.className = "role-label";
  label.textContent = role === "user" ? "You" : "Assistant";

  const body = document.createElement("div");
  body.className = "content";
  body.innerHTML = marked.parse(content);

  // Add action buttons (edit and delete)
  const actionsDiv = document.createElement("div");
  actionsDiv.className = "message-actions";
  
  const editBtn = document.createElement("button");
  editBtn.className = "action-btn edit-btn";
  editBtn.title = "Edit";
  editBtn.textContent = "✎";
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (index !== undefined) {
      startEdit(index);
    }
  });
  
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "action-btn delete-btn";
  deleteBtn.title = "Delete";
  deleteBtn.textContent = "🗑";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (index !== undefined) {
      handleDelete(index);
    }
  });
  
  actionsDiv.appendChild(editBtn);
  actionsDiv.appendChild(deleteBtn);

  const header = document.createElement("div");
  header.className = "message-header";
  header.appendChild(label);
  header.appendChild(actionsDiv);

  el.appendChild(header);
  el.appendChild(body);
  return el;
}

export function addMessage(role, content) {
  const index = state.conversationHistory.length;
  const el = createMessageElement(role, content, index);
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

export function handleDelete(index) {
  if (state.isStreaming) return;
  
  // Remove this message and all subsequent from conversationHistory
  state.conversationHistory = state.conversationHistory.slice(0, index);
  
  // Remove from DOM
  const messages = dom.messagesEl.querySelectorAll('.message:not(.error)');
  messages.forEach((el) => {
    const elIndex = parseInt(el.dataset.index, 10);
    if (elIndex >= index) {
      el.remove();
    }
  });
}

export function startEdit(index) {
  if (state.isStreaming) return;
  
  // Already editing this message — ignore
  if (state.editingIndex === index) return;

  // Cancel any existing edit first
  if (state.editingIndex !== null) {
    cancelEdit();
  }
  
  state.editingIndex = index;
  const el = dom.messagesEl.querySelector(`[data-index="${index}"]`);
  if (!el) return;
  
  // Get raw text from conversationHistory
  const rawText = state.conversationHistory[index].content;
  
  // Save original content for cancel
  el.dataset.originalContent = rawText;
  
  // Hide content, show textarea
  const contentDiv = el.querySelector('.content');
  contentDiv.style.display = 'none';
  
  const textarea = document.createElement('textarea');
  textarea.className = 'edit-textarea';
  textarea.value = rawText;
  el.appendChild(textarea);
  
  // Add Save/Cancel buttons
  const actionsDiv = el.querySelector('.message-actions');
  actionsDiv.querySelectorAll('.edit-btn, .delete-btn').forEach(btn => btn.style.display = 'none');
  
  const saveBtn = document.createElement('button');
  saveBtn.className = 'action-btn save-btn';
  saveBtn.textContent = 'Save';
  saveBtn.disabled = rawText.trim() === '';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'action-btn cancel-btn';
  cancelBtn.textContent = 'Cancel';
  
  actionsDiv.appendChild(saveBtn);
  actionsDiv.appendChild(cancelBtn);
  
  saveBtn.addEventListener('click', () => saveEdit(index));
  cancelBtn.addEventListener('click', cancelEdit);
  
  textarea.addEventListener('input', () => {
    saveBtn.disabled = textarea.value.trim() === '';
  });
}

export function cancelEdit() {
  if (state.editingIndex === null) return;
  const el = dom.messagesEl.querySelector(`[data-index="${state.editingIndex}"]`);
  if (el) {
    el.querySelector('.content').style.display = '';
    el.querySelector('.edit-textarea')?.remove();
    el.querySelectorAll('.edit-btn, .delete-btn').forEach(btn => btn.style.display = '');
    el.querySelectorAll('.save-btn, .cancel-btn').forEach(btn => btn.remove());
  }
  state.editingIndex = null;
}

export function saveEdit(index) {
  const el = dom.messagesEl.querySelector(`[data-index="${index}"]`);
  if (!el) return;
  const textarea = el.querySelector('.edit-textarea');
  const newContent = textarea.value;
  
  // Update conversationHistory in place
  state.conversationHistory[index].content = newContent;

  // Update the rendered content in the message element
  const contentDiv = el.querySelector('.content');
  contentDiv.innerHTML = marked.parse(newContent);
  contentDiv.style.display = '';

  // Remove textarea and Save/Cancel
  textarea.remove();
  const actionsDiv = el.querySelector('.message-actions');
  actionsDiv.querySelectorAll('.save-btn, .cancel-btn').forEach(btn => btn.remove());
  actionsDiv.querySelectorAll('.edit-btn, .delete-btn').forEach(btn => btn.style.display = '');

  state.editingIndex = null;
  dom.resendBtn.disabled = state.conversationHistory.length === 0;
}

export async function handleResend() {
  if (state.isStreaming) return;

  // Find the last user message in conversationHistory
  let lastUserIndex = -1;
  for (let i = state.conversationHistory.length - 1; i >= 0; i--) {
    if (state.conversationHistory[i].role === 'user') {
      lastUserIndex = i;
      break;
    }
  }
  if (lastUserIndex === -1) return;

  // Re-send: truncate at the last user message and re-trigger streaming.
  // This discards any assistant response after that message and gets a fresh one.
  state.conversationHistory = state.conversationHistory.slice(0, lastUserIndex + 1);

  // Remove messages from DOM at and after the last user message
  // (the assistant response will be replaced)
  const messages = dom.messagesEl.querySelectorAll('.message:not(.error)');
  messages.forEach((el) => {
    const elIndex = parseInt(el.dataset.index, 10);
    if (elIndex >= lastUserIndex) {
      el.remove();
    }
  });

  // Re-add the user message to DOM
  addMessage('user', state.conversationHistory[lastUserIndex].content);

  // Start streaming
  state.isStreaming = true;
  dom.sendBtn.disabled = true;
  dom.resendBtn.disabled = true;

  const assistantIndex = state.conversationHistory.length;
  state.currentAssistantEl = createMessageElement('assistant', '', assistantIndex);
  state.currentAssistantEl.classList.add('streaming');
  dom.messagesEl.appendChild(state.currentAssistantEl);
  state.currentAssistantContent = '';
  scrollToBottom();

  try {
    await invoke('send_message_stream', { messages: state.conversationHistory });
  } catch (err) {
    if (state.currentAssistantEl) {
      state.currentAssistantEl.remove();
    }
    addErrorMessage(typeof err === 'string' ? err : String(err));
    state.isStreaming = false;
    dom.sendBtn.disabled = false;
    dom.resendBtn.disabled = state.conversationHistory.length === 0;
    state.currentAssistantEl = null;
    state.currentAssistantContent = '';
  }
}
