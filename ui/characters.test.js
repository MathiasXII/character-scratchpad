import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();
const mockUpdateUIState = vi.fn();
const mockUpdateTokenCounter = vi.fn();
const mockUpdateInstructionsVisibility = vi.fn();
const mockGetEditorValue = vi.fn();
const mockSetEditorValue = vi.fn();
const mockSetEditorPlaceholder = vi.fn();
const mockOpenSettingsModal = vi.fn();
const mockUpdateGitBarVisibility = vi.fn();
const mockCheckDirty = vi.fn();
const mockRenderContextFileList = vi.fn();

const mockDom = {
  characterSelect: document.createElement('select'),
  newCharacterBtn: document.createElement('button'),
  newCharacterModal: document.createElement('div'),
  newCharacterNameInput: document.createElement('input'),
  newCharacterCreate: document.createElement('button'),
};

const mockState = {
  currentWorkFolder: '',
  selectedCharacter: 'existing',
  saveTimeout: null,
  contextLastSaved: { old: 'value' },
  tabContents: {
    instructions: 'old instructions',
    prompt: 'old prompt',
    description: 'old description',
    'first-response': 'old intro',
  },
  contextFiles: [{ name: 'old.md', content: 'old' }],
  activeContextFile: 'old.md',
  lastSavedContent: {
    instructions: '',
    prompt: '',
    description: '',
    'first-response': '',
  },
  activeTab: 'instructions',
  isLoadingCharacter: false,
};

vi.mock('./app.js', () => ({
  dom: mockDom,
  state: mockState,
  TAB_FILE_MAP: {
    instructions: 'instructions.txt',
    prompt: 'system-prompt.txt',
    description: 'description.txt',
    'first-response': 'intro.txt',
  },
  updateUIState: mockUpdateUIState,
}));

vi.mock('./editor.js', () => ({
  updateTokenCounter: mockUpdateTokenCounter,
  updateInstructionsVisibility: mockUpdateInstructionsVisibility,
  getEditorValue: mockGetEditorValue,
  setEditorValue: mockSetEditorValue,
  setEditorPlaceholder: mockSetEditorPlaceholder,
}));

vi.mock('./settings.js', () => ({
  openSettingsModal: mockOpenSettingsModal,
}));

vi.mock('./git.js', () => ({
  updateGitBarVisibility: mockUpdateGitBarVisibility,
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

let characters;

beforeAll(async () => {
  characters = await import('./characters.js');
});

beforeEach(() => {
  mockInvoke.mockReset();
mockUpdateUIState.mockReset();
mockUpdateTokenCounter.mockReset();
mockUpdateInstructionsVisibility.mockReset();
  mockGetEditorValue.mockReset();
  mockSetEditorValue.mockReset();
  mockSetEditorPlaceholder.mockReset();
  mockOpenSettingsModal.mockReset();
  mockUpdateGitBarVisibility.mockReset();
  mockCheckDirty.mockReset();
  mockRenderContextFileList.mockReset();

  mockDom.characterSelect.innerHTML = '';
  mockDom.characterSelect.disabled = false;
  mockDom.characterSelect.value = '';
  mockDom.newCharacterNameInput.value = '';
  mockDom.newCharacterNameInput.placeholder = '';
  mockDom.newCharacterNameInput.style.borderColor = '';
  mockDom.newCharacterCreate.disabled = false;
  mockDom.newCharacterModal.className = 'hidden';

  mockState.currentWorkFolder = '';
  mockState.selectedCharacter = 'existing';
  mockState.saveTimeout = null;
  mockState.contextLastSaved = { old: 'value' };
  mockState.tabContents = {
    instructions: 'old instructions',
    prompt: 'old prompt',
    description: 'old description',
    'first-response': 'old intro',
  };
  mockState.contextFiles = [{ name: 'old.md', content: 'old' }];
  mockState.activeContextFile = 'old.md';
  mockState.lastSavedContent = {
    instructions: '',
    prompt: '',
    description: '',
    'first-response': '',
  };
  mockState.activeTab = 'instructions';
  mockState.isLoadingCharacter = false;
});

describe('characters module', () => {
  it('shows a settings prompt when no work folder is configured', async () => {
    await characters.loadCharacters();

    expect(mockDom.characterSelect.options).toHaveLength(1);
    expect(mockDom.characterSelect.options[0].textContent).toBe('Set work folder in Settings');
    expect(mockDom.characterSelect.disabled).toBe(true);
  });

  it('populates the character dropdown when characters are available', async () => {
    mockState.currentWorkFolder = 'C:/chars';
    mockInvoke.mockResolvedValueOnce(['Alice', 'Bob']);

    await characters.loadCharacters();

    expect(mockInvoke).toHaveBeenCalledWith('list_characters', { workFolder: 'C:/chars' });
    expect([...mockDom.characterSelect.options].map((option) => option.textContent)).toEqual([
      'Scratchpad (no save)',
      'Alice',
      'Bob',
    ]);
    expect(mockDom.characterSelect.disabled).toBe(false);
    expect(mockUpdateGitBarVisibility).toHaveBeenCalled();
    expect(mockCheckDirty).toHaveBeenCalled();
  });

  it('rejects empty character names in the create flow', async () => {
    await characters.handleCreateCharacter();

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockDom.newCharacterNameInput.style.borderColor).toBe('var(--error)');
  });

  it('clears editor state when scratchpad mode is selected', async () => {
    mockDom.characterSelect.value = '';

    await characters.handleCharacterSelect();

    expect(mockState.selectedCharacter).toBe('');
    expect(mockState.contextFiles).toEqual([]);
    expect(mockState.activeContextFile).toBeNull();
    expect(mockSetEditorValue).toHaveBeenCalledWith('');
    expect(mockSetEditorPlaceholder).toHaveBeenCalledWith('Select a character to start editing...');
    expect(mockRenderContextFileList).toHaveBeenCalled();
    expect(mockUpdateUIState).toHaveBeenCalled();
  });

  it('loads tab files and context files for the selected character', async () => {
    mockState.currentWorkFolder = 'C:/chars';
    const opt = document.createElement('option');
    opt.value = 'Alice';
    opt.textContent = 'Alice';
    mockDom.characterSelect.appendChild(opt);
    mockDom.characterSelect.value = 'Alice';
    mockInvoke.mockImplementation(async (command, payload) => {
      if (command === 'ensure_character_files') {
        return undefined;
      }
      if (command === 'load_file') {
        const suffix = payload.path.replace('C:/chars/Alice/', '');
        const contents = {
          'instructions.txt': 'Instructions',
          'system-prompt.txt': 'Prompt',
          'description.txt': 'Description',
          'intro.txt': 'Intro',
        };
        return contents[suffix];
      }
      if (command === 'list_context_files') {
        return [{ name: 'lore.md', content: 'Lore' }];
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    await characters.handleCharacterSelect();

    expect(mockInvoke).toHaveBeenCalledWith('ensure_character_files', {
      workFolder: 'C:/chars',
      name: 'Alice',
    });
    expect(mockState.selectedCharacter).toBe('Alice');
    expect(mockState.tabContents).toEqual({
      instructions: 'Instructions',
      prompt: 'Prompt',
      description: 'Description',
      'first-response': 'Intro',
    });
    expect(mockState.lastSavedContent).toEqual({
      instructions: 'Instructions',
      prompt: 'Prompt',
      description: 'Description',
      'first-response': 'Intro',
    });
    expect(mockState.contextFiles).toEqual([{ name: 'lore.md', content: 'Lore' }]);
    expect(mockSetEditorValue).toHaveBeenCalledWith('Instructions');
    expect(mockSetEditorPlaceholder).toHaveBeenCalledWith('Start editing...');
    expect(mockState.isLoadingCharacter).toBe(false);
  });
});
