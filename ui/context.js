const { invoke } = window.__TAURI__;

import { dom, state } from "./app.js";
import { getEditorValue, setEditorValue, setEditorPlaceholder } from "./editor.js";
import { checkDirty } from "./git.js";

/**
 * Render the sidebar based on the active tab.
 * Clears the list and rebuilds content appropriate for the current tab.
 */
export function renderContextFileList() {
  const tab = state.activeTab;
  dom.contextFileList.innerHTML = "";

  // Context tab: show file list with header and add button
  if (tab === "context") {
    dom.contextSidebarTitle.textContent = "Files";
    dom.contextAddBtn.classList.remove("hidden");

    if (!state.selectedCharacter) {
      const placeholder = document.createElement("div");
      placeholder.className = "context-empty";
      placeholder.textContent = "Select a character";
      dom.contextFileList.appendChild(placeholder);
      dom.contextAddBtn.disabled = true;
      return;
    }

    dom.contextAddBtn.disabled = false;

    if (!state.contextFiles || state.contextFiles.length === 0) {
      const placeholder = document.createElement("div");
      placeholder.className = "context-empty";
      placeholder.textContent = "No context files";
      dom.contextFileList.appendChild(placeholder);
      return;
    }

    for (const file of state.contextFiles) {
      const item = document.createElement("div");
      item.className = "context-file-item";
      if (file.name === state.activeContextFile) {
        item.classList.add("active");
      }

      const nameSpan = document.createElement("span");
      nameSpan.className = "context-file-name";
      nameSpan.textContent = file.name;
      nameSpan.title = file.name;

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "context-file-delete";
      deleteBtn.textContent = "×";
      deleteBtn.title = "Delete " + file.name;
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleDeleteContextFile(file.name);
      });

      item.appendChild(nameSpan);
      item.appendChild(deleteBtn);
      item.addEventListener("click", () => selectContextFile(file.name));

      dom.contextFileList.appendChild(item);
    }
    return;
  }

  // Non-context tabs: empty sidebar (no label, no add button)
  dom.contextSidebarTitle.textContent = "";
  dom.contextAddBtn.classList.add("hidden");
}

/**
 * Select a context file and load its content into the editor.
 * Saves any pending changes to the currently active context file first.
 * @param {string} filename
 */
export async function selectContextFile(filename) {
  // Save current context file before switching
  if (state.activeContextFile && state.activeContextFile !== filename) {
    const currentContent = getEditorValue();
    if (currentContent !== state.contextLastSaved[state.activeContextFile]) {
      const charDir = state.currentWorkFolder + "/" + state.selectedCharacter;
      const path = charDir + "/context/" + state.activeContextFile;
      try {
        await invoke("save_file", { path, content: currentContent });
        state.contextLastSaved[state.activeContextFile] = currentContent;
        // Sync back to state.contextFiles
        const file = state.contextFiles.find((f) => f.name === state.activeContextFile);
        if (file) file.content = currentContent;
      } catch (error) {
        console.error("Failed to save context file:", error);
      }
    }
  }

  state.activeContextFile = filename;

  // Find and load content
  const file = state.contextFiles.find((f) => f.name === filename);
  if (file) {
    setEditorValue(file.content);
    setEditorPlaceholder("Start editing...");
    state.tabContents["context"] = file.content;
    state.contextLastSaved[filename] = file.content;
  } else {
    setEditorValue("");
    setEditorPlaceholder("Select a context file...");
    state.tabContents["context"] = "";
  }

  renderContextFileList();
  state.cmView?.focus();
}

/**
 * Prompt for a filename, create the file, and select it.
 */
export async function handleAddContextFile() {
  if (!state.selectedCharacter) return;

  const filename = prompt("Enter filename (e.g. lore.md):");
  if (!filename || filename.trim() === "") return;

  const trimmedName = filename.trim();
  const charDir = state.currentWorkFolder + "/" + state.selectedCharacter;

  try {
    await invoke("create_context_file", {
      characterDir: charDir,
      filename: trimmedName,
    });

    // Refresh file list
    state.contextFiles = await invoke("list_context_files", {
      characterDir: charDir,
    });

    // Find the created file (may have .txt appended)
    const created = state.contextFiles.find(
      (f) => f.name === trimmedName || f.name === trimmedName + ".txt" || f.name === trimmedName.replace(/\.md$/, "") + ".txt"
    );
    if (created) {
      await selectContextFile(created.name);
    }

    checkDirty();
  } catch (error) {
    const message = typeof error === "string" ? error : String(error);
    console.error("Failed to create context file:", message);
    // Show error as a transient toast in the sidebar
    const toast = document.createElement("div");
    toast.className = "context-delete-toast visible";
    toast.style.color = "var(--error)";
    toast.innerHTML = `<span>${message}</span>`;
    dom.contextFileList.appendChild(toast);
    setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

/**
 * Show toast confirmation and delete a context file.
 * @param {string} filename
 */
export function handleDeleteContextFile(filename) {
  // Create toast
  const toast = document.createElement("div");
  toast.className = "context-delete-toast";
  toast.innerHTML = `
    <span>Delete ${filename}?</span>
    <div class="toast-actions">
      <button class="confirm-btn">✓</button>
      <button class="cancel-btn">✗</button>
    </div>
  `;

  // Remove any existing toast
  const existing = document.querySelector(".context-delete-toast");
  if (existing) existing.remove();

  dom.contextFileList.appendChild(toast);
  // Force reflow for animation
  void toast.offsetWidth;
  toast.classList.add("visible");

  const confirmBtn = toast.querySelector(".confirm-btn");
  const cancelBtn = toast.querySelector(".cancel-btn");

  let autoDismissTimer;

  const dismiss = () => {
    clearTimeout(autoDismissTimer);
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 300);
  };

  confirmBtn.addEventListener("click", async () => {
    dismiss();
    await performDelete(filename);
  });

  cancelBtn.addEventListener("click", dismiss);

  // Auto-dismiss after 5 seconds
  autoDismissTimer = setTimeout(dismiss, 5000);
}

/**
 * Actually delete the file after user confirms.
 * @param {string} filename
 */
async function performDelete(filename) {
  const charDir = state.currentWorkFolder + "/" + state.selectedCharacter;

  try {
    await invoke("delete_context_file", {
      characterDir: charDir,
      filename,
    });

    // Refresh file list
    state.contextFiles = await invoke("list_context_files", {
      characterDir: charDir,
    });

    // If deleting the active file, clear editor
    if (state.activeContextFile === filename) {
      state.activeContextFile = null;
      state.tabContents["context"] = "";
      delete state.contextLastSaved[filename];
      setEditorValue("");
      setEditorPlaceholder("Select a context file...");
    }

    renderContextFileList();
    checkDirty();
  } catch (error) {
    console.error("Failed to delete context file:", error);
  }
}

/**
 * Initialize context tab - wire up event listeners.
 */
export function initContext() {
  dom.contextAddBtn.addEventListener("click", handleAddContextFile);
}