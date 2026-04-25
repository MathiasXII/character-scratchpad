import { buildMessagesArray } from "./chat.js";

const ROLE_LABELS = {
  system: "System",
  user: "User",
  assistant: "Assistant",
};

const DOMPURIFY_CONFIG = {
  ADD_TAGS: ["details", "summary"],
  ADD_ATTR: ["checked", "disabled"],
};

export function openPreview() {
  const previewContent = document.getElementById("preview-content");
  const previewModal = document.getElementById("preview-modal");
  if (!previewContent || !previewModal) return;

  const messages = buildMessagesArray();

  previewContent.innerHTML = "";

  if (messages.length === 0) {
    previewContent.innerHTML =
      '<div style="color: var(--text-secondary); text-align: center; padding: 32px 0;">No prompt to preview</div>';
  } else {
    const parts = [];

    for (const msg of messages) {
      let header = `**${ROLE_LABELS[msg.role] || msg.role}**`;
      if (msg.isFile) header += " *(Context)*";
      const rendered = DOMPurify.sanitize(marked.parse(msg.content), DOMPURIFY_CONFIG);
      parts.push(`<h4 class="preview-role-label preview-role-${msg.role}">${header}</h4>\n${rendered}`);
    }

    previewContent.innerHTML = parts.join("\n\n");
  }

  previewModal.classList.remove("hidden");
}

export function closePreview() {
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

  // Close modal on backdrop click
  if (previewModal) {
    previewModal.addEventListener("click", (e) => {
      if (e.target === previewModal) {
        closePreview();
      }
    });
  }

  // Close modal on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && previewModal && !previewModal.classList.contains("hidden")) {
      closePreview();
    }
  });
}