import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockInvoke, mockListen, listeners, mockDom, mockState } = vi.hoisted(() => {
  const mockInvoke = vi.fn();
  const mockListen = vi.fn();
  const listeners = {};

  function createButton() {
    const button = document.createElement('button');
    button.disabled = false;
    return button;
  }

  const mockDom = {
    messagesEl: document.createElement('div'),
    chatContainer: document.createElement('div'),
    userInput: document.createElement('textarea'),
    sendBtn: createButton(),
    resendBtn: createButton(),
    clearChatBtn: createButton(),
  };

  Object.defineProperty(mockDom.chatContainer, 'scrollHeight', {
    value: 240,
    writable: true,
    configurable: true,
  });

  const mockState = {
    conversationHistory: [],
    isStreaming: false,
    editingIndex: null,
    currentAssistantEl: null,
    currentAssistantContent: '',
    tabContents: {
      instructions: '',
      prompt: '',
      description: '',
      'first-response': '',
      context: '',
    },
    contextFiles: [],
    activeContextFile: null,
    activeTab: 'instructions',
    cmView: null,
    selectedCharacter: 'Guide',
    chatDisabled: false,
  };

  return { mockInvoke, mockListen, listeners, mockDom, mockState };
});

vi.mock('./app.js', () => ({
  dom: mockDom,
  state: mockState,
}));

globalThis.window.__TAURI__ = {
  core: {
    invoke: mockInvoke,
  },
  event: {
    listen: mockListen,
  },
};

globalThis.DOMPurify = {
  sanitize: vi.fn((html) => html),
};

globalThis.marked = {
  parse: vi.fn((value) => `<p>${value}</p>`),
};

globalThis.requestAnimationFrame = (callback) => {
  callback();
  return 1;
};

// Set up error notification elements in DOM before importing chat.js
// (chat.js uses document.getElementById at module level for these)
const errorNotificationEl = document.createElement('div');
errorNotificationEl.id = 'error-notification';
errorNotificationEl.className = 'error-notification hidden';
const errorTextEl = document.createElement('div');
errorTextEl.id = 'error-text';
errorTextEl.className = 'error-text';
const errorDismissEl = document.createElement('button');
errorDismissEl.id = 'error-dismiss';
errorDismissEl.className = 'error-dismiss';
errorNotificationEl.appendChild(errorTextEl);
errorNotificationEl.appendChild(errorDismissEl);
document.body.appendChild(errorNotificationEl);

let chat;
let syncFirstResponse;

beforeAll(async () => {
  mockListen.mockImplementation((eventName, handler) => {
    listeners[eventName] = handler;
    return Promise.resolve(() => {});
  });

  chat = await import('./chat.js');
  syncFirstResponse = chat.syncFirstResponse;
});

beforeEach(() => {
  mockInvoke.mockReset();
  mockListen.mockClear();
  Object.keys(listeners).forEach((key) => delete listeners[key]);
  globalThis.DOMPurify.sanitize.mockClear();
  globalThis.marked.parse.mockClear();

  mockDom.messagesEl.innerHTML = '';
  mockDom.userInput.value = '';
  mockDom.userInput.style.height = '';
  mockDom.userInput.disabled = false;
  mockDom.userInput.placeholder = '';
  mockDom.chatContainer.scrollTop = 0;
  mockDom.sendBtn.disabled = false;
  mockDom.resendBtn.disabled = true;
  mockDom.clearChatBtn.disabled = true;

  // Reset error notification state
  errorNotificationEl.classList.add('hidden');
  errorTextEl.textContent = '';

  mockState.conversationHistory = [];
  mockState.isStreaming = false;
  mockState.editingIndex = null;
  mockState.currentAssistantEl = null;
  mockState.currentAssistantContent = '';
  mockState.tabContents.instructions = '';
  mockState.tabContents.prompt = '';
  mockState.tabContents.description = '';
  mockState.tabContents['first-response'] = '';
  mockState.tabContents.context = '';
  mockState.contextFiles = [];
  mockState.activeContextFile = null;
  mockState.activeTab = 'instructions';
  mockState.selectedCharacter = 'Guide';
  mockState.chatDisabled = false;
  mockState.cmView = null;
});

describe('chat module', () => {
  it('builds system, context, and conversation messages when sending', async () => {
    mockDom.userInput.value = 'Hello there';
    mockState.tabContents.prompt = 'System: %%CHARACTER_INSTRUCTIONS%%';
    mockState.tabContents.instructions = 'Stay in character';
    mockState.contextFiles = [
      { name: 'lore.md', content: 'World lore' },
      { name: 'empty.md', content: '   ' },
    ];

    await chat.handleSend();

    expect(mockInvoke).toHaveBeenCalledWith('send_message_stream', {
      messages: [
        { role: 'system', content: 'System: Stay in character' },
        {
          role: 'user',
          content:
            'The following information is provided as background context for this character. It is not always relevant. Only refer to it if it\'s relevant to the discussion: World lore',
          isFile: true,
        },
        { role: 'user', content: 'Hello there' },
      ],
    });
    expect(mockState.conversationHistory).toEqual([{ role: 'user', content: 'Hello there' }]);
    expect(mockState.isStreaming).toBe(true);
    expect(mockDom.sendBtn.disabled).toBe(true);
    expect(mockDom.messagesEl.querySelectorAll('.message')).toHaveLength(2);
  });

  it('flushes streamed tokens on stream-end and restores controls', () => {
    chat.initStreamListeners();

    mockState.currentAssistantEl = chat.createMessageElement('assistant', '', 0);
    mockState.currentAssistantEl.classList.add('streaming');
    mockDom.messagesEl.appendChild(mockState.currentAssistantEl);
    mockState.isStreaming = true;

    listeners['stream-token']({ payload: 'Hello' });
    listeners['stream-token']({ payload: ' world' });
    listeners['stream-end']();

    expect(mockState.conversationHistory).toEqual([{ role: 'assistant', content: 'Hello world' }]);
    expect(mockState.isStreaming).toBe(false);
    expect(mockDom.sendBtn.disabled).toBe(false);
    expect(mockDom.resendBtn.disabled).toBe(false);
    expect(mockDom.clearChatBtn.disabled).toBe(false);
    expect(mockState.currentAssistantEl).toBeNull();
    expect(mockState.currentAssistantContent).toBe('');
  });

  it('shows an error message and resets streaming state when send fails', async () => {
    mockDom.userInput.value = 'Hello there';
    mockInvoke.mockRejectedValueOnce('network failed');

    await chat.handleSend();

    expect(mockState.isStreaming).toBe(false);
    expect(mockDom.sendBtn.disabled).toBe(false);
    expect(mockState.currentAssistantEl).toBeNull();
    expect(errorNotificationEl.classList.contains('hidden')).toBe(false);
    expect(errorTextEl.textContent).toBe('network failed');
  });

  it('deletes a message and all later messages from history and DOM', () => {
    mockState.conversationHistory = [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Reply' },
      { role: 'user', content: 'Second' },
    ];

    mockDom.messagesEl.appendChild(chat.createMessageElement('user', 'First', 0));
    mockDom.messagesEl.appendChild(chat.createMessageElement('assistant', 'Reply', 1));
    mockDom.messagesEl.appendChild(chat.createMessageElement('user', 'Second', 2));

    chat.handleDelete(1);

    expect(mockState.conversationHistory).toEqual([{ role: 'user', content: 'First' }]);
    expect(mockDom.messagesEl.querySelectorAll('.message')).toHaveLength(1);
  });

  it('supports editing a message in place and saving the new content', () => {
    mockState.conversationHistory = [{ role: 'user', content: 'Old text' }];
    mockDom.messagesEl.appendChild(chat.createMessageElement('user', 'Old text', 0));

    chat.startEdit(0);

    const textarea = mockDom.messagesEl.querySelector('.edit-textarea');
    textarea.value = 'New text';
    chat.saveEdit(0);

    expect(mockState.conversationHistory[0].content).toBe('New text');
    expect(mockDom.messagesEl.querySelector('.content')?.innerHTML).toContain('New text');
    expect(mockState.editingIndex).toBeNull();
  });

  it('resends from the last user message and starts a fresh stream', async () => {
    mockState.conversationHistory = [
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Answer one' },
      { role: 'user', content: 'Second' },
      { role: 'assistant', content: 'Answer two' },
    ];

    mockDom.messagesEl.appendChild(chat.createMessageElement('user', 'First', 0));
    mockDom.messagesEl.appendChild(chat.createMessageElement('assistant', 'Answer one', 1));
    mockDom.messagesEl.appendChild(chat.createMessageElement('user', 'Second', 2));
    mockDom.messagesEl.appendChild(chat.createMessageElement('assistant', 'Answer two', 3));

    await chat.handleResend();

    expect(mockState.conversationHistory).toEqual([
      { role: 'user', content: 'First' },
      { role: 'assistant', content: 'Answer one' },
      { role: 'user', content: 'Second' },
    ]);
    expect(mockState.isStreaming).toBe(true);
    expect(mockDom.resendBtn.disabled).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith('send_message_stream', {
      messages: [
        { role: 'user', content: 'First' },
        { role: 'assistant', content: 'Answer one' },
        { role: 'user', content: 'Second' },
      ],
    });
  });

  describe('first-response sync', () => {
    it('injects the first response when chat is empty and intro text exists', () => {
      mockState.tabContents['first-response'] = 'Hello there!';

      syncFirstResponse();

      expect(mockState.conversationHistory).toEqual([
        { role: 'assistant', content: 'Hello there!', _isFirstResponse: true },
      ]);
      expect(chat.buildMessagesArray()).toEqual([
        { role: 'assistant', content: 'Hello there!' },
      ]);
    });

    it('does not inject when intro text is empty or whitespace', () => {
      mockState.tabContents['first-response'] = '   \n  ';

      syncFirstResponse();

      expect(mockState.conversationHistory).toEqual([]);
      expect(chat.buildMessagesArray()).toEqual([]);
    });

    it('replaces the injected assistant bubble when the intro text changes', () => {
      mockState.conversationHistory = [
        { role: 'assistant', content: 'Old intro', _isFirstResponse: true },
      ];
      mockState.tabContents['first-response'] = 'New intro';

      syncFirstResponse();

      expect(mockState.conversationHistory).toEqual([
        { role: 'assistant', content: 'New intro', _isFirstResponse: true },
      ]);
      expect(chat.buildMessagesArray()).toEqual([
        { role: 'assistant', content: 'New intro' },
      ]);
    });

    it('removes the injected assistant bubble when intro text becomes empty', () => {
      mockState.conversationHistory = [
        { role: 'assistant', content: 'Injected intro', _isFirstResponse: true },
      ];
      mockState.tabContents['first-response'] = ' ';

      syncFirstResponse();

      expect(mockState.conversationHistory).toEqual([]);
      expect(chat.buildMessagesArray()).toEqual([]);
    });

    it('does not mutate history when user messages exist or more than one message is present', () => {
      mockState.conversationHistory = [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Already there' },
      ];
      mockState.tabContents['first-response'] = 'Injected intro';

      syncFirstResponse();

      expect(mockState.conversationHistory).toEqual([
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Already there' },
      ]);
      expect(chat.buildMessagesArray()).toEqual([
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Already there' },
      ]);
    });
  });

  describe('first-response regression', () => {
    it('serializes an injected first response as a plain assistant message', () => {
      mockState.conversationHistory = [
        { role: 'assistant', content: 'Hello there!', _isFirstResponse: true },
      ];

      expect(chat.buildMessagesArray()).toStrictEqual([
        { role: 'assistant', content: 'Hello there!' },
      ]);
    });

    it('clears injected first-response history and keeps sync coherent after clearing', () => {
      mockState.tabContents['first-response'] = 'Hello there!';
      mockState.conversationHistory = [
        { role: 'assistant', content: 'Hello there!', _isFirstResponse: true },
      ];
      mockDom.messagesEl.appendChild(chat.createMessageElement('assistant', 'Hello there!', 0));

      chat.handleClearChat();

      expect(mockState.conversationHistory).toEqual([]);
      expect(mockDom.messagesEl.querySelector('.welcome')).not.toBeNull();

      syncFirstResponse();

      expect(mockState.conversationHistory).toEqual([
        { role: 'assistant', content: 'Hello there!', _isFirstResponse: true },
      ]);
      expect(mockDom.messagesEl.querySelector('.welcome')).toBeNull();
      expect(chat.buildMessagesArray()).toStrictEqual([
        { role: 'assistant', content: 'Hello there!' },
      ]);
    });

    it('preserves an injected first response at the start of resend history', async () => {
      mockState.conversationHistory = [
        { role: 'assistant', content: 'Injected intro', _isFirstResponse: true },
        { role: 'user', content: 'First' },
        { role: 'assistant', content: 'Answer one' },
        { role: 'user', content: 'Second' },
        { role: 'assistant', content: 'Answer two' },
      ];

      mockDom.messagesEl.appendChild(chat.createMessageElement('assistant', 'Injected intro', 0));
      mockDom.messagesEl.appendChild(chat.createMessageElement('user', 'First', 1));
      mockDom.messagesEl.appendChild(chat.createMessageElement('assistant', 'Answer one', 2));
      mockDom.messagesEl.appendChild(chat.createMessageElement('user', 'Second', 3));
      mockDom.messagesEl.appendChild(chat.createMessageElement('assistant', 'Answer two', 4));

      await chat.handleResend();

      expect(mockState.conversationHistory).toEqual([
        { role: 'assistant', content: 'Injected intro', _isFirstResponse: true },
        { role: 'user', content: 'First' },
        { role: 'assistant', content: 'Answer one' },
        { role: 'user', content: 'Second' },
      ]);
      expect(mockState.conversationHistory[0]._isFirstResponse).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith('send_message_stream', {
        messages: [
          { role: 'assistant', content: 'Injected intro' },
          { role: 'user', content: 'First' },
          { role: 'assistant', content: 'Answer one' },
          { role: 'user', content: 'Second' },
        ],
      });
    });
  });
});
