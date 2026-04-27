import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockInvoke, mockCheckDirty, mockRenderContextFileList, mockSaveActiveContextFile } =
  vi.hoisted(() => ({
    mockInvoke: vi.fn(),
    mockCheckDirty: vi.fn(),
    mockRenderContextFileList: vi.fn(),
    mockSaveActiveContextFile: vi.fn(),
  }));

function createTab(tabName) {
  const button = document.createElement('button');
  button.dataset.tab = tabName;
  return button;
}

function createCmView(initialText = '') {
  let text = initialText;
  return {
    state: {
      doc: {
        toString: () => text,
        get length() {
          return text.length;
        },
      },
    },
    dispatch: ({ changes }) => {
      text = changes.insert;
    },
    focus: vi.fn(),
  };
}

const mockDom = {
  editorEl: document.createElement('div'),
  saveErrorBanner: document.createElement('div'),
  saveErrorText: document.createElement('div'),
  tokenCounter: document.createElement('div'),
  tabs: [createTab('instructions'), createTab('description'), createTab('context')],
};

const placeholder = document.createElement('div');
placeholder.className = 'cm-placeholder';
mockDom.editorEl.appendChild(placeholder);

// --- DOM elements for updateInstructionsVisibility ---
const instructionsTab = createTab('instructions');
instructionsTab.id = 'tab-instructions';
instructionsTab.classList.add('tab');
const instructionsIcon = document.createElement('span');
instructionsIcon.className = 'tab-warning-icon hidden';
instructionsIcon.id = 'instructions-invisible-icon';
instructionsTab.appendChild(instructionsIcon);

const instructionsBanner = document.createElement('div');
instructionsBanner.className = 'instructions-invisible-banner hidden';
instructionsBanner.id = 'instructions-invisible-banner';

// Build a tab-bar container so document.querySelector('#tab-bar .tab[data-tab="instructions"]') works
const tabBar = document.createElement('div');
tabBar.id = 'tab-bar';
tabBar.appendChild(instructionsTab);
document.body.appendChild(tabBar);
document.body.appendChild(instructionsBanner);

const mockState = {
  activeTab: 'instructions',
  selectedCharacter: 'hero',
  isLoadingCharacter: false,
  currentWorkFolder: 'C:/chars',
  saveTimeout: 7,
  tabContents: {
    instructions: 'Initial instructions',
    prompt: '',
    description: 'Saved description',
    context: '',
  },
  lastSavedContent: {
    instructions: 'Old instructions',
    prompt: '',
    description: 'Saved description',
    context: '',
  },
  contextFiles: [{ name: 'lore.md', content: 'Lore' }],
  activeContextFile: 'lore.md',
  contextLastSaved: { 'lore.md': 'Old lore' },
  cmView: createCmView('Updated instructions'),
};

vi.mock('./app.js', () => ({
  dom: mockDom,
  state: mockState,
  getCharacterDir: (workFolder, characterName) => workFolder + '/' + characterName,
  TAB_FILE_MAP: {
    instructions: 'instructions.txt',
    description: 'description.txt',
  },
}));

vi.mock('./git.js', () => ({
  checkDirty: mockCheckDirty,
}));

vi.mock('./context.js', () => ({
  renderContextFileList: mockRenderContextFileList,
  saveActiveContextFile: mockSaveActiveContextFile,
}));

globalThis.window.__TAURI__ = {
  core: {
    invoke: mockInvoke,
  },
};

let editor;

beforeAll(async () => {
  editor = await import('./editor.js');
});

beforeEach(() => {
  mockInvoke.mockReset();
  mockCheckDirty.mockReset();
  mockRenderContextFileList.mockReset();
  mockSaveActiveContextFile.mockReset();

  mockDom.saveErrorBanner.className = 'hidden';
  mockDom.saveErrorText.textContent = '';
  mockDom.tokenCounter.textContent = '';
  mockDom.tabs = [createTab('instructions'), createTab('description'), createTab('context')];
  mockDom.editorEl.innerHTML = '';
  const newPlaceholder = document.createElement('div');
  newPlaceholder.className = 'cm-placeholder';
  mockDom.editorEl.appendChild(newPlaceholder);

  mockState.activeTab = 'instructions';
  mockState.selectedCharacter = 'hero';
  mockState.isLoadingCharacter = false;
  mockState.currentWorkFolder = 'C:/chars';
  mockState.saveTimeout = 7;
  mockState.tabContents = {
    instructions: 'Initial instructions',
    prompt: '',
    description: 'Saved description',
    context: '',
  };
  mockState.lastSavedContent = {
    instructions: 'Old instructions',
    prompt: '',
    description: 'Saved description',
    context: '',
  };
  mockState.contextFiles = [{ name: 'lore.md', content: 'Lore' }];
  mockState.activeContextFile = 'lore.md';
  mockState.contextLastSaved = { 'lore.md': 'Old lore' };
  mockState.cmView = createCmView('Updated instructions');

  // Reset instructions-visibility DOM state between tests
  instructionsTab.classList.remove('tab-warning');
  instructionsIcon.classList.add('hidden');
  instructionsBanner.classList.add('hidden');
});

describe('editor module', () => {
  it('saves the active tab when content changed', async () => {
    await editor.saveCurrentTab();

    expect(mockInvoke).toHaveBeenCalledWith('save_file', {
      path: 'C:/chars/hero/instructions.txt',
      content: 'Updated instructions',
    });
    expect(mockState.tabContents.instructions).toBe('Updated instructions');
    expect(mockState.lastSavedContent.instructions).toBe('Updated instructions');
    expect(mockCheckDirty).toHaveBeenCalled();
  });

  it('does not save when the current tab matches last saved content', async () => {
    mockState.lastSavedContent.instructions = 'Updated instructions';

    await editor.saveCurrentTab();

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('saves context files separately and syncs their in-memory content', async () => {
    mockState.activeTab = 'context';
    mockState.cmView = createCmView('Updated lore');
    mockSaveActiveContextFile.mockResolvedValue(true);

    await editor.saveCurrentTab();

    expect(mockSaveActiveContextFile).toHaveBeenCalled();
    expect(mockCheckDirty).toHaveBeenCalled();
  });

  it('switches away from context tab by saving the current context file first', async () => {
    mockState.activeTab = 'context';
    mockState.cmView = createCmView('Unsaved context');
    mockState.tabContents.description = 'Loaded description';
    mockSaveActiveContextFile.mockResolvedValue(true);

    await editor.switchTab('description');

    expect(mockSaveActiveContextFile).toHaveBeenCalled();
    expect(mockState.activeTab).toBe('description');
    expect(editor.getEditorValue()).toBe('Loaded description');
    expect(mockRenderContextFileList).toHaveBeenCalled();
    expect(mockState.cmView.focus).toHaveBeenCalled();
  });

  it('updates the token counter using the current editor content length', () => {
    mockState.cmView = createCmView('abcdefgh');

    editor.updateTokenCounter();

    expect(mockDom.tokenCounter.textContent).toBe('2 tokens');
  });

  describe('updateInstructionsVisibility', () => {
    it('shows warning when instructions exist but %%CHARACTER_INSTRUCTIONS%% is missing from system prompt', () => {
      mockState.tabContents.instructions = 'Be helpful and concise.';
      mockState.tabContents.prompt = 'You are an assistant.';
      mockState.activeTab = 'prompt';

      editor.updateInstructionsVisibility();

      expect(instructionsIcon.classList.contains('hidden')).toBe(false);
      expect(instructionsTab.classList.contains('tab-warning')).toBe(true);
      expect(instructionsBanner.classList.contains('hidden')).toBe(false);
    });

    it('hides warning when %%CHARACTER_INSTRUCTIONS%% is present in system prompt', () => {
      mockState.tabContents.instructions = 'Be helpful and concise.';
      mockState.tabContents.prompt = 'System: %%CHARACTER_INSTRUCTIONS%%';
      mockState.activeTab = 'prompt';

      editor.updateInstructionsVisibility();

      expect(instructionsIcon.classList.contains('hidden')).toBe(true);
      expect(instructionsTab.classList.contains('tab-warning')).toBe(false);
      expect(instructionsBanner.classList.contains('hidden')).toBe(true);
    });

    it('hides warning when instructions are empty', () => {
      mockState.tabContents.instructions = '';
      mockState.tabContents.prompt = 'You are an assistant.';
      mockState.activeTab = 'prompt';

      editor.updateInstructionsVisibility();

      expect(instructionsIcon.classList.contains('hidden')).toBe(true);
      expect(instructionsTab.classList.contains('tab-warning')).toBe(false);
      expect(instructionsBanner.classList.contains('hidden')).toBe(true);
    });

    it('hides warning when instructions are whitespace only', () => {
      mockState.tabContents.instructions = '   \n  ';
      mockState.tabContents.prompt = 'You are an assistant.';

      editor.updateInstructionsVisibility();

      expect(instructionsIcon.classList.contains('hidden')).toBe(true);
      expect(instructionsTab.classList.contains('tab-warning')).toBe(false);
    });

    it('hides banner when not on the prompt tab, even if instructions are invisible', () => {
      mockState.tabContents.instructions = 'Be helpful.';
      mockState.tabContents.prompt = 'You are an assistant.';
      mockState.activeTab = 'instructions';

      editor.updateInstructionsVisibility();

      // Tab icon and warning class should still show
      expect(instructionsIcon.classList.contains('hidden')).toBe(false);
      expect(instructionsTab.classList.contains('tab-warning')).toBe(true);
      // But banner should be hidden because we're not on the prompt tab
      expect(instructionsBanner.classList.contains('hidden')).toBe(true);
    });

    it('shows banner when on the prompt tab and instructions are invisible', () => {
      mockState.tabContents.instructions = 'Be helpful.';
      mockState.tabContents.prompt = 'You are an assistant.';
      mockState.activeTab = 'prompt';

      editor.updateInstructionsVisibility();

      expect(instructionsBanner.classList.contains('hidden')).toBe(false);
    });

    it('clears warning when switching from invisible to visible state', () => {
      // First set to invisible state
      mockState.tabContents.instructions = 'Be helpful.';
      mockState.tabContents.prompt = 'You are an assistant.';

      editor.updateInstructionsVisibility();

      expect(instructionsTab.classList.contains('tab-warning')).toBe(true);

      // Now add the placeholder — should clear warning
      mockState.tabContents.prompt = 'You are an assistant.\n%%CHARACTER_INSTRUCTIONS%%';

      editor.updateInstructionsVisibility();

      expect(instructionsIcon.classList.contains('hidden')).toBe(true);
      expect(instructionsTab.classList.contains('tab-warning')).toBe(false);
      expect(instructionsBanner.classList.contains('hidden')).toBe(true);
    });
  });
});
