import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();
const mockLoadCharacters = vi.fn();
const mockUpdateUIState = vi.fn();
const mockSetEditorValue = vi.fn();
const mockSetEditorPlaceholder = vi.fn();
const mockUpdateTokenCounter = vi.fn();

const makeInput = (value = '') => ({ value, textContent: '' });
const makeDom = () => {
  const classList = {
    add: vi.fn(),
    remove: vi.fn(),
  };

  return {
    settingsModal: { classList },
    apiKeyInput: makeInput(),
    modelInput: makeInput(),
    endpointInput: makeInput(),
    temperatureInput: makeInput(),
    topPInput: makeInput(),
    temperatureValue: { textContent: '' },
    topPValue: { textContent: '' },
    workFolderInput: makeInput(),
  };
};

const mockDom = makeDom();
const mockState = {
  currentWorkFolder: '',
  selectedCharacter: 'original-character',
  tabContents: {
    instructions: 'a',
    prompt: 'b',
    description: 'c',
    'first-response': 'd',
  },
};

vi.mock('./app.js', () => ({
  dom: mockDom,
  state: mockState,
  updateUIState: mockUpdateUIState,
}));

vi.mock('./characters.js', () => ({
  loadCharacters: mockLoadCharacters,
}));

vi.mock('./editor.js', () => ({
  setEditorValue: mockSetEditorValue,
  setEditorPlaceholder: mockSetEditorPlaceholder,
  updateTokenCounter: mockUpdateTokenCounter,
}));

globalThis.window.__TAURI__ = {
  core: {
    invoke: mockInvoke,
  },
};

let settings;

beforeAll(async () => {
  settings = await import('./settings.js');
});

beforeEach(() => {
  mockInvoke.mockReset();
  mockLoadCharacters.mockReset();
  mockUpdateUIState.mockReset();
  mockSetEditorValue.mockReset();
  mockSetEditorPlaceholder.mockReset();
  mockUpdateTokenCounter.mockReset();
  window.localStorage.clear();

  mockDom.apiKeyInput.value = '';
  mockDom.modelInput.value = '';
  mockDom.endpointInput.value = '';
  mockDom.temperatureInput.value = '';
  mockDom.topPInput.value = '';
  mockDom.temperatureValue.textContent = '';
  mockDom.topPValue.textContent = '';
  mockDom.workFolderInput.value = '';

  mockState.currentWorkFolder = 'old-folder';
  mockState.selectedCharacter = 'original-character';
  mockState.tabContents.instructions = 'a';
  mockState.tabContents.prompt = 'b';
  mockState.tabContents.description = 'c';
  mockState.tabContents['first-response'] = 'd';
});

describe('settings module', () => {
  it('loads settings from localStorage into the UI state', () => {
    window.localStorage.setItem('llm-api-key', 'secret');
    window.localStorage.setItem('llm-model', 'gpt-4.1-mini');
    window.localStorage.setItem('llm-endpoint', 'https://example.test/chat');
    window.localStorage.setItem('llm-temperature', '0.25');
    window.localStorage.setItem('llm-top-p', '0.9');
    window.localStorage.setItem('llm-work-folder', 'characters');

    settings.loadSettingsFromStorage();

    expect(mockDom.apiKeyInput.value).toBe('secret');
    expect(mockDom.modelInput.value).toBe('gpt-4.1-mini');
    expect(mockDom.endpointInput.value).toBe('https://example.test/chat');
    expect(mockDom.temperatureInput.value).toBe('0.25');
    expect(mockDom.topPInput.value).toBe('0.9');
    expect(mockDom.temperatureValue.textContent).toBe('0.25');
    expect(mockDom.topPValue.textContent).toBe('0.9');
    expect(mockDom.workFolderInput.value).toBe('characters');
    expect(mockState.currentWorkFolder).toBe('characters');
  });

  it('syncs settings to the backend with parsed numeric fields', async () => {
    mockDom.apiKeyInput.value = 'secret';
    mockDom.modelInput.value = 'gpt-4.1-mini';
    mockDom.endpointInput.value = 'https://example.test/chat';
    mockDom.temperatureInput.value = '0.25';
    mockDom.topPInput.value = '0.9';

    await settings.syncSettingsToBackend();

    expect(mockInvoke).toHaveBeenCalledWith('update_settings', {
      settings: {
        apiKey: 'secret',
        model: 'gpt-4.1-mini',
        endpoint: 'https://example.test/chat',
        temperature: 0.25,
        topP: 0.9,
      },
    });
  });

  it('saves settings and reloads characters when the work folder changes', async () => {
    mockDom.apiKeyInput.value = 'secret';
    mockDom.modelInput.value = 'gpt-4.1-mini';
    mockDom.endpointInput.value = 'https://example.test/chat';
    mockDom.temperatureInput.value = '0.25';
    mockDom.topPInput.value = '0.9';
    mockDom.workFolderInput.value = 'new-folder';

    await settings.handleSaveSettings();

    expect(window.localStorage.getItem('llm-api-key')).toBe('secret');
    expect(window.localStorage.getItem('llm-model')).toBe('gpt-4.1-mini');
    expect(window.localStorage.getItem('llm-endpoint')).toBe('https://example.test/chat');
    expect(window.localStorage.getItem('llm-temperature')).toBe('0.25');
    expect(window.localStorage.getItem('llm-top-p')).toBe('0.9');
    expect(window.localStorage.getItem('llm-work-folder')).toBe('new-folder');
    expect(mockUpdateUIState).toHaveBeenCalled();
    expect(mockDom.settingsModal.classList.add).toHaveBeenCalledWith('hidden');
    expect(mockState.currentWorkFolder).toBe('new-folder');
    expect(mockState.selectedCharacter).toBe('');
    expect(mockState.tabContents).toEqual({
      instructions: '',
      prompt: '',
      description: '',
      'first-response': '',
    });
    expect(mockSetEditorValue).toHaveBeenCalledWith('');
    expect(mockSetEditorPlaceholder).toHaveBeenCalledWith('Select a character to start editing...');
    expect(mockUpdateTokenCounter).toHaveBeenCalled();
    expect(mockLoadCharacters).toHaveBeenCalled();
  });
});
