import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();
const mockCheckDirty = vi.fn();
const mockRenderContextFileList = vi.fn();

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

const mockState = {
  activeTab: 'instructions',
  selectedCharacter: 'hero',
  isLoadingCharacter: false,
  currentWorkFolder: 'C:/chars',
  saveTimeout: 7,
  tabContents: {
    instructions: 'Initial instructions',
    description: 'Saved description',
    context: '',
  },
  lastSavedContent: {
    instructions: 'Old instructions',
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
    description: 'Saved description',
    context: '',
  };
  mockState.lastSavedContent = {
    instructions: 'Old instructions',
    description: 'Saved description',
    context: '',
  };
  mockState.contextFiles = [{ name: 'lore.md', content: 'Lore' }];
  mockState.activeContextFile = 'lore.md';
  mockState.contextLastSaved = { 'lore.md': 'Old lore' };
  mockState.cmView = createCmView('Updated instructions');
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

    await editor.saveCurrentTab();

    expect(mockInvoke).toHaveBeenCalledWith('save_file', {
      path: 'C:/chars/hero/context/lore.md',
      content: 'Updated lore',
    });
    expect(mockState.contextLastSaved['lore.md']).toBe('Updated lore');
    expect(mockState.contextFiles[0].content).toBe('Updated lore');
    expect(mockCheckDirty).toHaveBeenCalled();
  });

  it('switches away from context tab by saving the current context file first', async () => {
    mockState.activeTab = 'context';
    mockState.cmView = createCmView('Unsaved context');
    mockState.tabContents.description = 'Loaded description';

    await editor.switchTab('description');

    expect(mockInvoke).toHaveBeenCalledWith('save_file', {
      path: 'C:/chars/hero/context/lore.md',
      content: 'Unsaved context',
    });
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
});
