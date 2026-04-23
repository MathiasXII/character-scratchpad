const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

import { dom, state } from "./app.js";

const DOMPURIFY_CONFIG = {
  ADD_TAGS: ["details", "summary"],
  ADD_ATTR: ["checked", "disabled"],
};

/**
 * Build the full messages array to send to the LLM API.
 *
 * Message structure (matches Venice.ai / SillyTavern convention):
 *
 *   1. SYSTEM message — system-prompt.txt with %%CHARACTER_INSTRUCTIONS%% replaced
 *      by instructions.txt content. Only included if system-prompt.txt is non-empty
 *      OR instructions.txt is non-empty.
 *
 *   2. CONTEXT FILE messages — each file from context/ becomes a user message
 *      with { isFile: true } and an intro sentence prepended:
 *      "The following information is provided as background context for this character.
 *       It is not always relevant. Only refer to it if it's relevant to the discussion: "
 *      Only included if context files exist.
 *
 *   3. CONVERSATION HISTORY — the actual user/assistant messages as-is.
 */
function buildMessagesArray() {
  // Sync active context file content to state.contextFiles before building messages
  if (state.activeTab === "context" && state.activeContextFile && state.cmView) {
    const editorContent = state.cmView.state.doc.toString();
    const file = state.contextFiles.find(f => f.name === state.activeContextFile);
    if (file) file.content = editorContent;
  }

  // Sync current editor content to state so we always use what's on screen,
  // even if the debounced save hasn't fired yet
  if (state.cmView) {
    state.tabContents[state.activeTab] = state.cmView.state.doc.toString();
  }

  const messages = [];

  // 1. System message: system-prompt.txt with %%CHARACTER_INSTRUCTIONS%% replaced
  const systemPrompt = state.tabContents.prompt || "";
  const instructions = state.tabContents.instructions || "";

  if (systemPrompt.trim() || instructions.trim()) {
    const systemContent = systemPrompt.replace(
      "%%CHARACTER_INSTRUCTIONS%%",
      instructions
    );
    messages.push({ role: "system", content: systemContent });
  }

  // 2. Context files as user messages with isFile flag
  const CONTEXT_INTRO =
    "The following information is provided as background context for this character. " +
    "It is not always relevant. Only refer to it if it's relevant to the discussion: ";

  for (const file of state.contextFiles) {
    if (file.content && file.content.trim()) {
      messages.push({
        role: "user",
        content: CONTEXT_INTRO + file.content,
        isFile: true,
      });
    }
  }

  // 3. Conversation history
  for (const msg of state.conversationHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  return messages;
}

export function initStreamListeners() {
  let rafPending = false;

  listen("stream-token", (event) => {
    state.currentAssistantContent += event.payload;  // always synchronous
    if (state.currentAssistantEl && !rafPending) {
      rafPending = true;
      requestAnimationFrame(() => {
        if (state.currentAssistantEl) {
          state.currentAssistantEl.querySelector(".content").innerHTML = DOMPurify.sanitize(marked.parse(state.currentAssistantContent), DOMPURIFY_CONFIG);
          scrollToBottom();
        }
        rafPending = false;
      });
    }
  });

  listen("stream-end", () => {
    // Flush any pending rAF render synchronously before clearing state
    if (state.currentAssistantEl) {
      state.currentAssistantEl.querySelector(".content").innerHTML = DOMPurify.sanitize(marked.parse(state.currentAssistantContent), DOMPURIFY_CONFIG);
      state.currentAssistantEl.classList.remove("streaming");
    }
    rafPending = false;
    state.conversationHistory.push({ role: "assistant", content: state.currentAssistantContent });
    state.isStreaming = false;
    dom.sendBtn.disabled = false;
    dom.resendBtn.disabled = state.conversationHistory.length === 0;
    dom.clearChatBtn.disabled = state.conversationHistory.length === 0;
    state.currentAssistantEl = null;
    state.currentAssistantContent = "";
  });

  listen("stream-error", (event) => {
    addErrorMessage(event.payload);
    state.isStreaming = false;
    dom.sendBtn.disabled = false;
    dom.resendBtn.disabled = state.conversationHistory.length === 0;
    dom.clearChatBtn.disabled = state.conversationHistory.length === 0;
    state.currentAssistantEl = null;
    state.currentAssistantContent = "";
  });
}

export async function handleSend() {
  if (state.chatDisabled) return;

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
    const messages = buildMessagesArray();
    await invoke("send_message_stream", { messages });
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
  body.innerHTML = DOMPurify.sanitize(marked.parse(content), DOMPURIFY_CONFIG);

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
  
  actionsDiv.appendChild(deleteBtn);
  actionsDiv.appendChild(editBtn);

  const header = document.createElement("div");
  header.className = "message-header";
  header.appendChild(label);

  el.appendChild(header);
  el.appendChild(body);
  el.appendChild(actionsDiv);
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

export function handleClearChat() {
  if (state.chatDisabled) return;
  if (state.isStreaming) return;
  state.conversationHistory = [];
  dom.messagesEl.innerHTML = "";
  dom.resendBtn.disabled = true;
  dom.clearChatBtn.disabled = true;
  showWelcome();
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
  contentDiv.innerHTML = DOMPurify.sanitize(marked.parse(newContent), DOMPURIFY_CONFIG);
  contentDiv.style.display = '';

  // Remove textarea and Save/Cancel
  textarea.remove();
  const actionsDiv = el.querySelector('.message-actions');
  actionsDiv.querySelectorAll('.save-btn, .cancel-btn').forEach(btn => btn.remove());
  actionsDiv.querySelectorAll('.edit-btn, .delete-btn').forEach(btn => btn.style.display = '');

  state.editingIndex = null;
  dom.resendBtn.disabled = state.conversationHistory.length === 0;
  dom.clearChatBtn.disabled = state.conversationHistory.length === 0;
}

export async function handleResend() {
  if (state.chatDisabled) return;
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
  dom.clearChatBtn.disabled = true;

  const assistantIndex = state.conversationHistory.length;
  state.currentAssistantEl = createMessageElement('assistant', '', assistantIndex);
  state.currentAssistantEl.classList.add('streaming');
  dom.messagesEl.appendChild(state.currentAssistantEl);
  state.currentAssistantContent = '';
  scrollToBottom();

  try {
    const messages = buildMessagesArray();
    await invoke('send_message_stream', { messages });
  } catch (err) {
    if (state.currentAssistantEl) {
      state.currentAssistantEl.remove();
    }
    addErrorMessage(typeof err === 'string' ? err : String(err));
    state.isStreaming = false;
    dom.sendBtn.disabled = false;
    dom.resendBtn.disabled = state.conversationHistory.length === 0;
    dom.clearChatBtn.disabled = state.conversationHistory.length === 0;
    state.currentAssistantEl = null;
    state.currentAssistantContent = '';
  }
}
