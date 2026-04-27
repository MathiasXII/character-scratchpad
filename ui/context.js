const { invoke } = window.__TAURI__.core;
const { getCurrentWebview } = window.__TAURI__.webview;

import { dom, state } from "./app.js";
import { getRepoPath, formatError } from "./helpers.js";
import { getEditorValue, setEditorValue, setEditorPlaceholder, setEditorReadOnly } from "./editor.js";
import { checkDirty } from "./git.js";

/**
 * Save the active context file if it has unsaved changes.
 * Returns true if a save was performed, false if skipped (no active file,
 * read-only, unchanged, or no character selected).
 * Throws on save failure — caller should handle errors.
 */
export async function saveActiveContextFile() {
  if (!state.activeContextFile || !state.selectedCharacter || state.isLoadingCharacter) {
    return false;
  }
  const activeFile = state.contextFiles.find(f => f.name === state.activeContextFile);
  if (activeFile?.isReadOnly) {
    return false;
  }
  const content = getEditorValue();
  if (content === state.contextLastSaved[state.activeContextFile]) {
    return false;
  }
  const charDir = getRepoPath(state);
  const path = charDir + "/context/" + state.activeContextFile;
  await invoke("save_file", { path, content });
  state.contextLastSaved[state.activeContextFile] = content;
  const file = state.contextFiles.find(f => f.name === state.activeContextFile);
  if (file) file.content = content;
  return true;
}

/**
 * Refresh the context file list from disk and update state.
 */
export async function refreshContextFiles(charDir) {
  try {
    state.contextFiles = await invoke("list_context_files", { characterDir: charDir });
  } catch (error) {
    console.error("Failed to load context files:", formatError(error));
    state.contextFiles = [];
  }
}

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

      if (file.isReadOnly) {
        item.classList.add("context-file-item--readonly");
        const badge = document.createElement("span");
        badge.className = "context-file-badge";
        badge.textContent = "PDF";
        nameSpan.appendChild(badge);
      }

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
    try {
      await saveActiveContextFile();
    } catch (error) {
      console.error("Failed to save context file:", formatError(error));
    }
  }

  state.activeContextFile = filename;

  // Find and load content
  const file = state.contextFiles.find((f) => f.name === filename);
  if (file) {
    setEditorValue(file.content);
    setEditorReadOnly(!!file.isReadOnly);
    setEditorPlaceholder(file.isReadOnly ? "Read-only PDF — extracted text" : "Start editing...");
    state.tabContents["context"] = file.content;
    state.contextLastSaved[filename] = file.content;
  } else {
    setEditorValue("");
    setEditorReadOnly(false);
    setEditorPlaceholder("Select a context file...");
    state.tabContents["context"] = "";
  }

  renderContextFileList();
  state.cmView?.focus();
}

/**
 * Open the new context file modal.
 */
export function openNewContextModal() {
  if (!state.selectedCharacter) return;

  dom.newContextNameInput.value = "";
  dom.newContextNameInput.style.borderColor = "";
  dom.newContextModal.classList.remove("hidden");
  dom.newContextNameInput.focus();
}

/**
 * Close the new context file modal.
 */
export function closeNewContextModal() {
  dom.newContextModal.classList.add("hidden");
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !dom.newContextModal.classList.contains("hidden")) {
    closeNewContextModal();
  }
});

/**
 * Create the context file from the modal input.
 */
export async function handleCreateContextFile() {
  const filename = dom.newContextNameInput.value.trim();
  if (!filename) {
    dom.newContextNameInput.style.borderColor = "var(--error)";
    dom.newContextNameInput.focus();
    return;
  }

  dom.newContextCreate.disabled = true;
  const charDir = getRepoPath(state);

  try {
    await invoke("create_context_file", {
      characterDir: charDir,
      filename,
    });

    await refreshContextFiles(charDir);

    const created = state.contextFiles.find(
      (f) => f.name === filename || f.name === filename + ".txt" || f.name === filename.replace(/\.md$/, "") + ".txt"
    );
    if (created) {
      await selectContextFile(created.name);
    }

    checkDirty();
    closeNewContextModal();
  } catch (error) {
    dom.newContextNameInput.style.borderColor = "var(--error)";
    dom.newContextNameInput.value = "";
    dom.newContextNameInput.placeholder =
      typeof error === "string" ? error : String(error);
    dom.newContextNameInput.focus();
  } finally {
    dom.newContextCreate.disabled = false;
  }
}

/**
 * Open the new context file modal when the add button is clicked.
 */
export async function handleAddContextFile() {
  openNewContextModal();
}

/**
 * Show modal confirmation to delete a context file.
 * @param {string} filename
 */
export function handleDeleteContextFile(filename) {
  dom.deleteContextMessage.textContent = `Are you sure you want to delete "${filename}"? This cannot be undone.`;
  dom.deleteContextModal.classList.remove("hidden");

  // Remove previous listeners by cloning buttons
  const newConfirm = dom.deleteContextConfirm.cloneNode(true);
  const newCancel = dom.deleteContextCancel.cloneNode(true);
  const newClose = dom.deleteContextClose.cloneNode(true);
  dom.deleteContextConfirm.replaceWith(newConfirm);
  dom.deleteContextCancel.replaceWith(newCancel);
  dom.deleteContextClose.replaceWith(newClose);
  // Update dom refs
  dom.deleteContextConfirm = newConfirm;
  dom.deleteContextCancel = newCancel;
  dom.deleteContextClose = newClose;

  const close = () => {
    dom.deleteContextModal.classList.add("hidden");
  };

  newConfirm.addEventListener("click", async () => {
    close();
    await performDelete(filename);
  });

  newCancel.addEventListener("click", close);
  newClose.addEventListener("click", close);


}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !dom.deleteContextModal.classList.contains("hidden")) {
    dom.deleteContextModal.classList.add("hidden");
  }
});

/**
 * Actually delete the file after user confirms.
 * @param {string} filename
 */
async function performDelete(filename) {
  const charDir = getRepoPath(state);

  try {
    await invoke("delete_context_file", {
      characterDir: charDir,
      filename,
    });

    // Refresh file list
    await refreshContextFiles(charDir);

    // If deleting the active file, clear editor
    if (state.activeContextFile === filename) {
      state.activeContextFile = null;
      state.tabContents["context"] = "";
      delete state.contextLastSaved[filename];
      setEditorValue("");
      setEditorPlaceholder("Select a context file...");
      setEditorReadOnly(false);
    }

    renderContextFileList();
    checkDirty();
  } catch (error) {
    console.error("Failed to delete context file:", formatError(error));
  }
}

/**
 * Show the drop overlay and highlight the sidebar.
 */
function showDropOverlay() {
  dom.contextSidebar.classList.add("drag-active");
  dom.dropOverlay.classList.remove("hidden");
}

/**
 * Hide the drop overlay and remove sidebar highlight.
 */
function hideDropOverlay() {
  dom.contextSidebar.classList.remove("drag-active");
  dom.dropOverlay.classList.add("hidden");
}

/**
 * Handle files dropped into the context sidebar via Tauri's native drag & drop.
 * Copies each valid file into the character's context/ directory.
 * @param {string[]} paths - Absolute file paths from the Tauri drop event.
 */
async function handleDroppedFiles(paths) {
  if (!state.selectedCharacter || !state.currentWorkFolder) {
    return;
  }

  const charDir = getRepoPath(state);
  const allowedExtensions = ["txt", "md", "pdf"];
  let copiedCount = 0;
  const errors = [];

  for (const filePath of paths) {
    const ext = filePath.split(".").pop().toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      errors.push(`${filePath.split(/[/\\]/).pop()}: unsupported type (.${ext})`);
      continue;
    }

    try {
      await invoke("copy_file_to_context", {
        sourcePath: filePath,
        characterDir: charDir,
      });
      copiedCount++;
    } catch (error) {
      const msg = typeof error === "string" ? error : String(error);
      const fileName = filePath.split(/[/\\]/).pop();
      errors.push(`${fileName}: ${msg}`);
    }
  }

  // Refresh the file list if any files were copied
  if (copiedCount > 0) {
    await refreshContextFiles(charDir);
    renderContextFileList();
    checkDirty();
  }

  // Report errors if any
  if (errors.length > 0) {
    console.warn("Drop errors:", errors.join("\n"));
  }
}

/**
 * Initialize context tab - wire up event listeners.
 */
export function initContext() {
  dom.contextAddBtn.addEventListener("click", handleAddContextFile);

  // Set up Tauri native drag & drop handling
  const webview = getCurrentWebview();

  webview.onDragDropEvent((event) => {
    const payload = event.payload;

    if (payload.type === "enter") {
      // Files dragged into the window — show overlay if a character is selected
      if (state.selectedCharacter) {
        showDropOverlay();
      }
    } else if (payload.type === "over") {
      // Drag is moving over the window — overlay already visible
    } else if (payload.type === "leave") {
      hideDropOverlay();
    } else if (payload.type === "drop") {
      hideDropOverlay();

      if (payload.paths && payload.paths.length > 0) {
        handleDroppedFiles(payload.paths);
      }
    }
  });
}
