import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();
const mockLoadCharacters = vi.fn();
const mockUpdateUIState = vi.fn();
const mockSetEditorValue = vi.fn();
const mockSetEditorPlaceholder = vi.fn();
const mockUpdateTokenCounter = vi.fn();

const makeInput = (value = '') => ({ value, textContent: '', classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn() } });
const makeBtn = (label = 'Test') => ({
  textContent: label,
  disabled: false,
  classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn() },
});
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
    modelDropdownBtn: { disabled: true, addEventListener: vi.fn() },
    modelDropdown: { innerHTML: '', classList: { add: vi.fn(), remove: vi.fn() }, appendChild: vi.fn(), children: [] },
    testConnectionBtn: makeBtn(),
    testModelBtn: makeBtn(),
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
  mockDom.modelDropdownBtn.disabled = true;
  mockDom.modelDropdown.innerHTML = '';
  mockDom.modelDropdown.classList.add.mockReset();
  mockDom.modelDropdown.classList.remove.mockReset();

  // Reset test button mocks
  for (const btn of [mockDom.testConnectionBtn, mockDom.testModelBtn]) {
    btn.textContent = 'Test';
    btn.disabled = false;
    btn.classList.add.mockReset();
    btn.classList.remove.mockReset();
  }
  for (const input of [mockDom.apiKeyInput, mockDom.modelInput, mockDom.endpointInput]) {
    input.classList.add.mockReset();
    input.classList.remove.mockReset();
  }

  mockInvoke.mockImplementation((cmd) => {
    if (cmd === 'fetch_models') return [];
    return null;
  });

  mockState.currentWorkFolder = 'old-folder';
  mockState.selectedCharacter = 'original-character';
  mockState.tabContents.instructions = 'a';
  mockState.tabContents.prompt = 'b';
  mockState.tabContents.description = 'c';
  mockState.tabContents['first-response'] = 'd';
});

describe('settings module', () => {
  it('loads settings from localStorage into the UI state', async () => {
    window.localStorage.setItem('llm-api-key', 'secret');
    window.localStorage.setItem('llm-model', 'gpt-4.1-mini');
    window.localStorage.setItem('llm-endpoint', 'https://example.test/chat');
    window.localStorage.setItem('llm-temperature', '0.25');
    window.localStorage.setItem('llm-top-p', '0.9');
    window.localStorage.setItem('llm-work-folder', 'characters');

    await settings.loadSettingsFromStorage();

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

  it('sortModels sorts normal models first, then tee, then ee2e', () => {
    const models = [
      'ee2e-model-a',
      'gpt-4o-mini',
      'tee-model-b',
      'claude-3',
      'ee2e-model-b',
      'tee-model-a',
      'llama-3',
    ];

    const sorted = settings.sortModels(models);

    expect(sorted).toEqual([
      'claude-3',
      'gpt-4o-mini',
      'llama-3',
      'tee-model-a',
      'tee-model-b',
      'ee2e-model-a',
      'ee2e-model-b',
    ]);
  });

  describe('testConnection', () => {
    it('shows success checkmark on successful connection test', async () => {
      mockDom.endpointInput.value = 'https://api.test/v1';
      mockDom.apiKeyInput.value = 'sk-test';
      mockInvoke.mockResolvedValue({ success: true });

      await settings.testConnection();

      expect(mockInvoke).toHaveBeenCalledWith('test_connection', {
        baseUrl: 'https://api.test/v1',
        apiKey: 'sk-test',
      });
      expect(mockDom.testConnectionBtn.textContent).toBe('✓');
      expect(mockDom.testConnectionBtn.classList.add).toHaveBeenCalledWith('success');
    });

    it('highlights endpoint on connection failure', async () => {
      mockDom.endpointInput.value = 'https://bad.test/v1';
      mockDom.apiKeyInput.value = 'sk-test';
      mockInvoke.mockResolvedValue({ success: false, error_type: 'connection', message: 'Could not connect' });

      await settings.testConnection();

      expect(mockDom.testConnectionBtn.textContent).toBe('✗');
      expect(mockDom.testConnectionBtn.classList.add).toHaveBeenCalledWith('error');
      expect(mockDom.endpointInput.classList.add).toHaveBeenCalledWith('field-error');
    });

    it('highlights API key on auth failure (401)', async () => {
      mockDom.endpointInput.value = 'https://api.test/v1';
      mockDom.apiKeyInput.value = 'bad-key';
      mockInvoke.mockResolvedValue({ success: false, error_type: 'auth', message: 'Invalid API key' });

      await settings.testConnection();

      expect(mockDom.testConnectionBtn.textContent).toBe('✗');
      expect(mockDom.testConnectionBtn.classList.add).toHaveBeenCalledWith('error');
      expect(mockDom.apiKeyInput.classList.add).toHaveBeenCalledWith('field-error');
    });

    it('highlights endpoint on 404 (bad URL)', async () => {
      mockDom.endpointInput.value = 'https://api.test/wrong';
      mockDom.apiKeyInput.value = 'sk-test';
      mockInvoke.mockResolvedValue({ success: false, error_type: 'endpoint', message: 'Endpoint not found' });

      await settings.testConnection();

      expect(mockDom.endpointInput.classList.add).toHaveBeenCalledWith('field-error');
    });

    it('shows success when model error is returned (key is valid)', async () => {
      mockDom.endpointInput.value = 'https://api.test/v1';
      mockDom.apiKeyInput.value = 'sk-valid';
      mockInvoke.mockResolvedValue({ success: true, error_type: null, message: null });

      await settings.testConnection();

      expect(mockDom.testConnectionBtn.textContent).toBe('✓');
      expect(mockDom.testConnectionBtn.classList.add).toHaveBeenCalledWith('success');
    });

    it('highlights both fields if endpoint or key is empty', async () => {
      mockDom.endpointInput.value = '';
      mockDom.apiKeyInput.value = '';

      await settings.testConnection();

      expect(mockDom.testConnectionBtn.textContent).toBe('✗');
      expect(mockDom.testConnectionBtn.classList.add).toHaveBeenCalledWith('error');
      expect(mockDom.endpointInput.classList.add).toHaveBeenCalledWith('field-error');
      expect(mockDom.apiKeyInput.classList.add).toHaveBeenCalledWith('field-error');
    });
  });

  describe('testModel', () => {
    it('shows success checkmark on successful model test', async () => {
      mockDom.endpointInput.value = 'https://api.test/v1';
      mockDom.apiKeyInput.value = 'sk-test';
      mockDom.modelInput.value = 'gpt-4o-mini';
      mockInvoke.mockResolvedValue({ success: true });

      await settings.testModel();

      expect(mockInvoke).toHaveBeenCalledWith('test_model', {
        baseUrl: 'https://api.test/v1',
        apiKey: 'sk-test',
        model: 'gpt-4o-mini',
      });
      expect(mockDom.testModelBtn.textContent).toBe('✓');
      expect(mockDom.testModelBtn.classList.add).toHaveBeenCalledWith('success');
    });

    it('highlights model on model_not_found error', async () => {
      mockDom.endpointInput.value = 'https://api.test/v1';
      mockDom.apiKeyInput.value = 'sk-test';
      mockDom.modelInput.value = 'nonexistent';
      mockInvoke.mockResolvedValue({ success: false, error_type: 'model_not_found', message: 'Model not found' });

      await settings.testModel();

      expect(mockDom.testModelBtn.textContent).toBe('✗');
      expect(mockDom.testModelBtn.classList.add).toHaveBeenCalledWith('error');
      expect(mockDom.modelInput.classList.add).toHaveBeenCalledWith('field-error');
    });

    it('highlights API key on auth error from model test', async () => {
      mockDom.endpointInput.value = 'https://api.test/v1';
      mockDom.apiKeyInput.value = 'bad-key';
      mockDom.modelInput.value = 'gpt-4o-mini';
      mockInvoke.mockResolvedValue({ success: false, error_type: 'auth', message: 'Invalid API key' });

      await settings.testModel();

      expect(mockDom.apiKeyInput.classList.add).toHaveBeenCalledWith('field-error');
    });

    it('highlights model if model field is empty', async () => {
      mockDom.endpointInput.value = 'https://api.test/v1';
      mockDom.apiKeyInput.value = 'sk-test';
      mockDom.modelInput.value = '';

      await settings.testModel();

      expect(mockDom.testModelBtn.textContent).toBe('✗');
      expect(mockDom.modelInput.classList.add).toHaveBeenCalledWith('field-error');
    });
  });

  describe('clearTestResults', () => {
    it('resets both test buttons and clears all field errors', () => {
      mockDom.testConnectionBtn.textContent = '✗';
      mockDom.testConnectionBtn.classList.add('error');
      mockDom.testModelBtn.textContent = '✓';
      mockDom.testModelBtn.classList.add('success');

      settings.clearTestResults();

      expect(mockDom.testConnectionBtn.textContent).toBe('Test');
      expect(mockDom.testModelBtn.textContent).toBe('Test');
      expect(mockDom.testConnectionBtn.classList.remove).toHaveBeenCalledWith('success', 'error');
      expect(mockDom.testModelBtn.classList.remove).toHaveBeenCalledWith('success', 'error');
      expect(mockDom.apiKeyInput.classList.remove).toHaveBeenCalledWith('field-error');
      expect(mockDom.endpointInput.classList.remove).toHaveBeenCalledWith('field-error');
      expect(mockDom.modelInput.classList.remove).toHaveBeenCalledWith('field-error');
    });
  });
});
