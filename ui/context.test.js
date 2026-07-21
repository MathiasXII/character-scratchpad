import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();
const mockGetEditorValue = vi.fn();
const mockSetEditorValue = vi.fn();
const mockSetEditorPlaceholder = vi.fn();
const mockSetEditorReadOnly = vi.fn();
const mockCheckDirty = vi.fn();

const mockDom = {};

function resetDom() {
  mockDom.contextSidebarTitle = document.createElement('div');
  mockDom.contextFileList = document.createElement('div');
  mockDom.contextAddBtn = document.createElement('button');
  mockDom.newContextModal = document.createElement('div');
  mockDom.newContextNameInput = document.createElement('input');
  mockDom.newContextClose = document.createElement('button');
  mockDom.newContextCancel = document.createElement('button');
  mockDom.newContextCreate = document.createElement('button');
  mockDom.deleteContextModal = document.createElement('div');
  mockDom.deleteContextClose = document.createElement('button');
  mockDom.deleteContextMessage = document.createElement('div');
  mockDom.deleteContextCancel = document.createElement('button');
  mockDom.deleteContextConfirm = document.createElement('button');

  mockDom.deleteContextModal.appendChild(mockDom.deleteContextClose);
  mockDom.deleteContextModal.appendChild(mockDom.deleteContextMessage);
  mockDom.deleteContextModal.appendChild(mockDom.deleteContextCancel);
  mockDom.deleteContextModal.appendChild(mockDom.deleteContextConfirm);
}

resetDom();

const mockState = {
  activeTab: 'context',
  selectedCharacter: '',
  currentWorkFolder: 'C:/chars',
  contextFiles: [],
  activeContextFile: null,
  contextLastSaved: {},
  tabContents: { context: '' },
  cmView: { focus: vi.fn() },
};

vi.mock('./app.js', () => ({
  dom: mockDom,
  state: mockState,
  getCharacterDir: (workFolder, characterName) => workFolder + '/' + characterName,
}));

vi.mock('./editor.js', () => ({
  getEditorValue: mockGetEditorValue,
  setEditorValue: mockSetEditorValue,
  setEditorPlaceholder: mockSetEditorPlaceholder,
  setEditorReadOnly: mockSetEditorReadOnly,
}));

vi.mock('./git.js', () => ({
  checkDirty: mockCheckDirty,
}));

globalThis.window.__TAURI__ = {
  core: {
    invoke: mockInvoke,
  },
  webview: {
    getCurrentWebview: vi.fn(() => ({
      onDragDropEvent: vi.fn(),
    })),
  },
};

let contextModule;

beforeAll(async () => {
  contextModule = await import('./context.js');
});

beforeEach(() => {
  mockInvoke.mockReset();
  mockGetEditorValue.mockReset();
  mockSetEditorValue.mockReset();
  mockSetEditorPlaceholder.mockReset();
  mockSetEditorReadOnly.mockReset();
  mockCheckDirty.mockReset();
  resetDom();

  mockState.activeTab = 'context';
  mockState.selectedCharacter = '';
  mockState.currentWorkFolder = 'C:/chars';
  mockState.contextFiles = [];
  mockState.activeContextFile = null;
  mockState.contextLastSaved = {};
  mockState.tabContents = { context: '' };
  mockState.cmView = { focus: vi.fn() };
});

describe('context module', () => {
  it('renders a placeholder when no character is selected', () => {
    contextModule.renderContextFileList();

    expect(mockDom.contextSidebarTitle.textContent).toBe('Files');
    expect(mockDom.contextAddBtn.disabled).toBe(true);
    expect(mockDom.contextFileList.textContent).toContain('Select a character');
  });

  it('hides the add button outside the context tab', () => {
    mockState.activeTab = 'instructions';

    contextModule.renderContextFileList();

    expect(mockDom.contextSidebarTitle.textContent).toBe('');
    expect(mockDom.contextAddBtn.classList.contains('hidden')).toBe(true);
  });

  it('saves the previous context file before switching to another one', async () => {
    mockState.selectedCharacter = 'hero';
    mockState.activeContextFile = 'old.txt';
    mockState.contextLastSaved.oldTxt = 'unused';
    mockState.contextLastSaved['old.txt'] = 'before';
    mockState.contextFiles = [
      { name: 'old.txt', content: 'before' },
      { name: 'new.txt', content: 'after' },
    ];
    mockGetEditorValue.mockReturnValue('changed');

    await contextModule.selectContextFile('new.txt');

    expect(mockInvoke).toHaveBeenCalledWith('save_file', {
      path: 'C:/chars/hero/context/old.txt',
      content: 'changed',
      workFolder: 'C:/chars',
    });
    expect(mockState.contextFiles[0].content).toBe('changed');
    expect(mockState.activeContextFile).toBe('new.txt');
    expect(mockSetEditorValue).toHaveBeenCalledWith('after');
    expect(mockSetEditorPlaceholder).toHaveBeenCalledWith('Start editing...');
  });

  it('creates a context file, refreshes the list, and selects the created file', async () => {
    mockState.selectedCharacter = 'hero';
    mockDom.newContextNameInput.value = 'notes';
    mockInvoke.mockImplementation(async (command) => {
      if (command === 'create_context_file') {
        return 'C:/chars/hero/context/notes.txt';
      }
      if (command === 'list_context_files') {
        return [{ name: 'notes.txt', content: '' }];
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    await contextModule.handleCreateContextFile();

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'create_context_file', {
      characterDir: 'C:/chars/hero',
      filename: 'notes',
      workFolder: 'C:/chars',
    });
    expect(mockState.contextFiles).toEqual([{ name: 'notes.txt', content: '' }]);
    expect(mockState.activeContextFile).toBe('notes.txt');
    expect(mockSetEditorValue).toHaveBeenCalledWith('');
    expect(mockCheckDirty).toHaveBeenCalled();
  });

  it('deletes the active context file and clears the editor after confirmation', async () => {
    mockState.selectedCharacter = 'hero';
    mockState.contextFiles = [{ name: 'notes.txt', content: 'draft' }];
    mockState.activeContextFile = 'notes.txt';
    mockInvoke.mockImplementation(async (command) => {
      if (command === 'delete_context_file') {
        return undefined;
      }
      if (command === 'list_context_files') {
        return [];
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    contextModule.handleDeleteContextFile('notes.txt');
    await mockDom.deleteContextConfirm.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockState.activeContextFile).toBeNull();
    expect(mockState.contextFiles).toEqual([]);
    expect(mockState.tabContents.context).toBe('');
    expect(mockSetEditorValue).toHaveBeenCalledWith('');
    expect(mockSetEditorPlaceholder).toHaveBeenCalledWith('Select a context file...');
    expect(mockCheckDirty).toHaveBeenCalled();
  });
});
