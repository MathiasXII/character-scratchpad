import { TRACKED_TAB_FILES as TAB_FILE_MAP, TRACKED_FOLDERS } from "./tracked-paths.js";

export { TAB_FILE_MAP, TRACKED_FOLDERS };

// Derive initial tab state from the tracked files config
const initialTabContents = {};
const initialLastSaved = {};
for (const key of Object.keys(TAB_FILE_MAP)) {
  initialTabContents[key] = "";
  initialLastSaved[key] = "";
}

export const state = {
  conversationHistory: [],
  isStreaming: false,
  editingIndex: null,
  currentAssistantEl: null,
  currentAssistantContent: "",
  tabContents: initialTabContents,
  contextFiles: [],
  activeContextFile: null,
  contextLastSaved: {},
  activeTab: Object.keys(TAB_FILE_MAP)[0] || "instructions",
  currentWorkFolder: "",
  selectedCharacter: "",
  saveTimeout: null,
  isLoadingCharacter: false,
  cmView: null,
  lastSavedContent: initialLastSaved,
  chatDisabled: false,
};

export const dom = {
  messagesEl: document.getElementById("messages"),
  chatContainer: document.getElementById("chat-container"),
  userInput: document.getElementById("user-input"),
  sendBtn: document.getElementById("send-btn"),
  resendBtn: document.getElementById("resend-btn"),
  clearChatBtn: document.getElementById("clear-chat-btn"),
  settingsBtn: document.getElementById("settings-btn"),
  settingsModal: document.getElementById("settings-modal"),
  settingsClose: document.getElementById("settings-close"),
  saveSettingsBtn: document.getElementById("save-settings"),
  apiKeyInput: document.getElementById("api-key"),
  modelInput: document.getElementById("model"),
  endpointInput: document.getElementById("endpoint"),
  temperatureInput: document.getElementById("temperature"),
  temperatureValue: document.getElementById("temperature-value"),
  topPInput: document.getElementById("top-p"),
  topPValue: document.getElementById("top-p-value"),
  editorEl: document.getElementById("editor"),
  tabs: document.querySelectorAll("#tab-bar .tab"),
  tokenCounter: document.getElementById("token-counter"),
  characterSelect: document.getElementById("character-select"),
  newCharacterBtn: document.getElementById("new-character-btn"),
  newCharacterModal: document.getElementById("new-character-modal"),
  newCharacterNameInput: document.getElementById("new-character-name"),
  newCharacterClose: document.getElementById("new-character-close"),
  newCharacterCancel: document.getElementById("new-character-cancel"),
  newCharacterCreate: document.getElementById("new-character-create"),
  workFolderInput: document.getElementById("work-folder"),
  browseFolderBtn: document.getElementById("browse-folder-btn"),
  saveErrorBanner: document.getElementById("save-error-banner"),
  saveErrorText: document.getElementById("save-error-text"),
  saveErrorDismiss: document.getElementById("save-error-dismiss"),
  headerLeft: document.getElementById("header-left"),
  leftPane: document.getElementById("left-pane"),
  gitStatusIndicator: document.getElementById("git-status-indicator"),
  gitCommitBtn: document.getElementById("git-commit-btn"),
  contextSidebar: document.getElementById("context-sidebar"),
  contextSidebarTitle: document.getElementById("context-sidebar-title"),
  contextFileList: document.getElementById("context-file-list"),
  contextAddBtn: document.getElementById("context-add-btn"),
  deleteContextModal: document.getElementById("delete-context-modal"),
  deleteContextClose: document.getElementById("delete-context-close"),
  deleteContextMessage: document.getElementById("delete-context-message"),
  deleteContextCancel: document.getElementById("delete-context-cancel"),
  deleteContextConfirm: document.getElementById("delete-context-confirm"),
  chatDisabledOverlay: document.getElementById("chat-disabled-overlay"),
  chatDisabledSettingsBtn: document.getElementById("chat-disabled-settings-btn"),
  dropOverlay: document.getElementById("drop-overlay"),
};

import {
  addErrorMessage,
  autoResizeInput,
  handleSend,
  handleResend,
  handleClearChat,
  initStreamListeners,
  scrollToBottom,
  showWelcome,
} from "./chat.js";
import {
  closeNewCharacterModal,
  handleCharacterSelect,
  handleCreateCharacter,
  loadCharacters,
  openNewCharacterModal,
} from "./characters.js";
import { hideSaveError, saveCurrentTab, switchTab, updateTokenCounter } from "./editor.js";
import { initPaneDivider } from "./divider.js";
import { initGit, updateGitBarVisibility, checkDirty } from "./git.js";
import {
  closeSettingsModal,
  handleSaveSettings,
  loadSettingsFromStorage,
  openSettingsModal,
  syncSettingsToBackend,
} from "./settings.js";
import { initContext } from "./context.js";

const { open } = window.__TAURI__.dialog;

/**
 * Check settings and update UI accordingly:
 * - If API key, model, or endpoint is missing → disable chat panel (overlay)
 * - If no workspace folder → disable Create Character, hide Context tab
 */
export function updateUIState() {
  const apiKey = dom.apiKeyInput.value.trim();
  const model = dom.modelInput.value.trim();
  const endpoint = dom.endpointInput.value.trim();
  const workFolder = dom.workFolderInput.value.trim();

  // Chat panel: disabled if any of API key, model, or endpoint is missing
  const chatSettingsMissing = !apiKey || !model || !endpoint;
  state.chatDisabled = chatSettingsMissing;

  if (chatSettingsMissing) {
    dom.chatDisabledOverlay.classList.remove("hidden");
    dom.sendBtn.disabled = true;
    dom.resendBtn.disabled = true;
    dom.clearChatBtn.disabled = true;
    dom.userInput.disabled = true;
    dom.userInput.placeholder = "Configure settings to start chatting...";
  } else {
    dom.chatDisabledOverlay.classList.add("hidden");
    dom.userInput.disabled = false;
    dom.userInput.placeholder = "Type a message...";
    // Restore send/resend state based on streaming + conversation
    if (!state.isStreaming) {
      dom.sendBtn.disabled = false;
    }
    if (!state.isStreaming && state.conversationHistory.length > 0) {
      dom.resendBtn.disabled = false;
    }
    dom.clearChatBtn.disabled = state.conversationHistory.length === 0;
  }

  // Workspace folder: disable Create Character, hide Context tab
  const noWorkFolder = !workFolder;

  if (noWorkFolder) {
    dom.newCharacterBtn.disabled = true;
  } else {
    dom.newCharacterBtn.disabled = false;
  }

  // Hide/show Context tab — only visible when a character is selected
  const contextTab = document.querySelector('#tab-bar .tab[data-tab="context"]');
  if (contextTab) {
    if (!state.selectedCharacter) {
      contextTab.classList.add("tab-hidden");
      if (state.activeTab === "context") {
        const firstTab = document.querySelector('#tab-bar .tab:not(.tab-hidden)');
        if (firstTab) {
          switchTab(firstTab.dataset.tab);
        }
      }
    } else {
      contextTab.classList.remove("tab-hidden");
    }
  }
}

async function init() {
  loadSettingsFromStorage();
  await syncSettingsToBackend();
  updateUIState();
  showWelcome();
  initPaneDivider();
  // Sync header-left width with left-pane width
  const headerLeft = dom.headerLeft;
  const leftPane = dom.leftPane;
  if (headerLeft && leftPane) {
    const syncHeaderWidth = () => {
      headerLeft.style.width = leftPane.offsetWidth + "px";
    };
    syncHeaderWidth();
    new ResizeObserver(syncHeaderWidth).observe(leftPane);
  }
  initGit();
  initContext();
  await loadCharacters();
  initStreamListeners();

  // Set initial resend button state
  dom.resendBtn.disabled = state.conversationHistory.length === 0;

  dom.sendBtn.addEventListener("click", handleSend);
  dom.resendBtn.addEventListener("click", handleResend);
  dom.clearChatBtn.addEventListener("click", handleClearChat);
  dom.userInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  });
  dom.userInput.addEventListener("input", autoResizeInput);

  dom.settingsBtn.addEventListener("click", openSettingsModal);
  dom.chatDisabledSettingsBtn.addEventListener("click", openSettingsModal);
  dom.settingsClose.addEventListener("click", closeSettingsModal);
  dom.settingsModal.addEventListener("click", (event) => {
    if (event.target === dom.settingsModal) {
      closeSettingsModal();
    }
  });
  dom.saveSettingsBtn.addEventListener("click", handleSaveSettings);
  dom.temperatureInput.addEventListener("input", () => {
    dom.temperatureValue.textContent = dom.temperatureInput.value;
  });
  dom.topPInput.addEventListener("input", () => {
    dom.topPValue.textContent = dom.topPInput.value;
  });

  dom.browseFolderBtn.addEventListener("click", async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      dom.workFolderInput.value = selected;
    }
  });

  dom.newCharacterBtn.addEventListener("click", openNewCharacterModal);
  dom.newCharacterClose.addEventListener("click", closeNewCharacterModal);
  dom.newCharacterCancel.addEventListener("click", closeNewCharacterModal);
  dom.newCharacterModal.addEventListener("click", (event) => {
    if (event.target === dom.newCharacterModal) {
      closeNewCharacterModal();
    }
  });
  dom.newCharacterCreate.addEventListener("click", handleCreateCharacter);
  dom.newCharacterNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleCreateCharacter();
    }
    dom.newCharacterNameInput.style.borderColor = "";
  });

  dom.characterSelect.addEventListener("change", handleCharacterSelect);
  dom.saveErrorDismiss.addEventListener("click", hideSaveError);

  dom.tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  state.cmView = window.createCodeMirrorEditor(dom.editorEl, {
    doc: state.tabContents[state.activeTab],
    onChange: () => {
      updateTokenCounter();
      if (!state.isLoadingCharacter) {
        clearTimeout(state.saveTimeout);
        state.saveTimeout = setTimeout(saveCurrentTab, 1000);
      }
    }
  });
  updateTokenCounter();
}

void init();
