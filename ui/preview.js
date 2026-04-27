import { buildPromptOnly } from "./chat.js";
import { renderMarkdown } from "./helpers.js";

const ROLE_LABELS = {
  system: "System",
  user: "User",
  assistant: "Assistant",
};

/**
 * Render an array of ChatMessage objects into the preview modal content.
 * Shared by full preview and per-message preview.
 */
export function renderPreviewMessages(messages) {
  const previewContent = document.getElementById("preview-content");
  if (!previewContent) return;

  previewContent.innerHTML = "";

  if (messages.length === 0) {
    previewContent.innerHTML =
      '<div style="color: var(--text-secondary); text-align: center; padding: 32px 0;">No prompt to preview</div>';
  } else {
    const parts = [];

    for (const msg of messages) {
      let header = `**${ROLE_LABELS[msg.role] || msg.role}**`;
      if (msg.isFile) header += " *(Context)*";
      const rendered = renderMarkdown(msg.content);
      parts.push(`<h4 class="preview-role-label preview-role-${msg.role}">${header}</h4>\n${rendered}`);
    }

    previewContent.innerHTML = parts.join("\n\n");
  }
}

function openPreview() {
  const previewModal = document.getElementById("preview-modal");
  if (!previewModal) return;

  const messages = buildPromptOnly();
  renderPreviewMessages(messages);
  previewModal.classList.remove("hidden");
}

function closePreview() {
  const previewModal = document.getElementById("preview-modal");
  if (previewModal) previewModal.classList.add("hidden");
}

export function initPreview() {
  const previewBtn = document.getElementById("preview-btn");
  const previewClose = document.getElementById("preview-close");
  const previewModal = document.getElementById("preview-modal");

  if (previewBtn) {
    previewBtn.addEventListener("click", openPreview);
  }

  if (previewClose) {
    previewClose.addEventListener("click", closePreview);
  }

  // Close modal on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && previewModal && !previewModal.classList.contains("hidden")) {
      closePreview();
    }
  });
}
