import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();
const mockShowSaveError = vi.fn();
const mockSaveCurrentTab = vi.fn();
const mockReloadAfterRevert = vi.fn();
const mockGetEditorValue = vi.fn();

const mockDom = {
  gitStatusIndicator: document.createElement('div'),
  gitCommitBtn: document.createElement('button'),
};

const historyBtn = document.createElement('button');
historyBtn.id = 'git-history-btn';
document.body.appendChild(historyBtn);

const historyModal = document.createElement('div');
historyModal.id = 'git-history-modal';
historyModal.className = 'hidden';
document.body.appendChild(historyModal);

const historyList = document.createElement('div');
historyList.id = 'git-history-list';
historyModal.appendChild(historyList);

const statusEl = document.createElement('div');
statusEl.id = 'git-save-status';
document.body.appendChild(statusEl);

const historyClose = document.createElement('button');
historyClose.id = 'git-history-close';
document.body.appendChild(historyClose);

const mockState = {
  currentWorkFolder: '',
  selectedCharacter: '',
  activeTab: 'instructions',
  cmView: null,
  tabContents: {
    instructions: 'Current instructions',
    description: 'Description',
  },
  contextFiles: [],
  activeContextFile: null,
};

vi.mock('./app.js', () => ({
  dom: mockDom,
  state: mockState,
  TAB_FILE_MAP: {
    instructions: 'instructions.txt',
    description: 'description.txt',
  },
  TRACKED_FOLDERS: [
    {
      path: 'context',
      extensions: ['.md', '.txt', '.pdf'],
    },
  ],
}));

vi.mock('./editor.js', () => ({
  showSaveError: mockShowSaveError,
  saveCurrentTab: mockSaveCurrentTab,
  getEditorValue: mockGetEditorValue,
}));

vi.mock('./characters.js', () => ({
  reloadAfterRevert: mockReloadAfterRevert,
}));

globalThis.window.__TAURI__ = {
  core: {
    invoke: mockInvoke,
  },
};

globalThis.requestAnimationFrame = (callback) => {
  callback();
  return 1;
};

globalThis.HTMLElement.prototype.scrollIntoView = vi.fn();

let git;

beforeAll(async () => {
  git = await import('./git.js');
});

beforeEach(() => {
  mockInvoke.mockReset();
  mockShowSaveError.mockReset();
  mockSaveCurrentTab.mockReset();
  mockReloadAfterRevert.mockReset();
  mockGetEditorValue.mockReset();

  mockDom.gitStatusIndicator.textContent = '';
  mockDom.gitStatusIndicator.className = 'git-status-indicator';
  mockDom.gitCommitBtn.className = '';
  mockDom.gitCommitBtn.disabled = false;
  historyBtn.className = '';
  historyList.innerHTML = '';
  historyModal.className = 'hidden';

  mockState.currentWorkFolder = '';
  mockState.selectedCharacter = '';
  mockState.activeTab = 'instructions';
  mockState.cmView = null;
  mockState.tabContents = {
    instructions: 'Current instructions',
    description: 'Description',
  };
  mockState.contextFiles = [];
  mockState.activeContextFile = null;
});

describe('git module', () => {
  it('hides the commit button when no repository is selected', async () => {
    await git.checkDirty();

    expect(mockDom.gitStatusIndicator.textContent).toBe('');
    expect(mockDom.gitCommitBtn.classList.contains('hidden')).toBe(true);
    expect(mockDom.gitCommitBtn.disabled).toBe(true);
  });

  it('marks the repo dirty when a tracked file is new relative to HEAD', async () => {
    mockState.currentWorkFolder = 'C:/chars';
    mockState.selectedCharacter = 'hero';
    mockGetEditorValue.mockReturnValue('Current instructions');
    mockInvoke.mockImplementation(async (command, payload) => {
      if (command === 'git_get_head_content' && payload.filePath === 'instructions.txt') {
        return null;
      }
      return 'Description';
    });

    await git.checkDirty();

    expect(mockDom.gitStatusIndicator.textContent).toBe('Pending changes');
    expect(mockDom.gitCommitBtn.disabled).toBe(false);
    expect(mockDom.gitCommitBtn.classList.contains('has-changes')).toBe(true);
  });

  it('renders history entries and marks the current commit in the modal', async () => {
    mockState.currentWorkFolder = 'C:/chars';
    mockState.selectedCharacter = 'hero';
    mockInvoke.mockResolvedValueOnce([
      { id: 'abc', message: 'Current checkpoint', timestamp: 1710000000, is_current: true },
      { id: 'def', message: 'Older checkpoint', timestamp: 1700000000, is_current: false },
    ]);

    await git.openGitHistory();

    expect(historyModal.classList.contains('hidden')).toBe(false);
    expect(historyList.querySelectorAll('.git-history-entry')).toHaveLength(2);
    expect(historyList.querySelector('.git-history-entry.current')).not.toBeNull();
    expect(historyList.textContent).toContain('Current checkpoint');
    expect(historyList.textContent).toContain('Older checkpoint');
  });
});
