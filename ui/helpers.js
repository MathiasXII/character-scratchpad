export const MARKDOWN_RENDER_CONFIG = {
  ADD_TAGS: ["details", "summary"],
  ADD_ATTR: ["checked", "disabled"],
};

export function formatError(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return typeof error === "string" ? error : String(error);
}

export function renderMarkdown(markdown) {
  return DOMPurify.sanitize(marked.parse(markdown), MARKDOWN_RENDER_CONFIG);
}

export function getCharacterDir(workFolder, characterName) {
  return workFolder && characterName ? workFolder + "/" + characterName : "";
}

/**
 * Sync the current CodeMirror editor content back into the shared state
 * so that prompt-building and dirty-checking always see what's on screen,
 * even if the debounced save hasn't fired yet.
 *
 * This must be called before any operation that reads from state.tabContents
 * or state.contextFiles to guarantee they reflect the live editor.
 */
export function syncEditorToState(state) {
  if (state.activeTab === "context" && state.activeContextFile && state.cmView) {
    const editorContent = state.cmView.state.doc.toString();
    const file = state.contextFiles.find(f => f.name === state.activeContextFile);
    if (file) file.content = editorContent;
  }

  if (state.cmView) {
    state.tabContents[state.activeTab] = state.cmView.state.doc.toString();
  }
}

/**
 * Build the assembled system prompt by replacing the
 * %%CHARACTER_INSTRUCTIONS%% placeholder in system-prompt.txt
 * with the content of instructions.txt.
 *
 * Returns the assembled string, or null if both are empty.
 */
export function buildSystemPrompt(state) {
  const systemPrompt = state.tabContents.prompt || "";
  const instructions = state.tabContents.instructions || "";

  if (!systemPrompt.trim() && !instructions.trim()) {
    return null;
  }

  return systemPrompt.replace("%%CHARACTER_INSTRUCTIONS%%", instructions);
}

/**
 * Prefix prepended to each context file's content when injected
 * as a user message in the prompt.
 */
export const CONTEXT_INTRO =
  "The following information is provided as background context for this character. " +
  "It is not always relevant. Only refer to it if it's relevant to the discussion: ";

/**
 * Build an array of user messages from the non-empty context files.
 * Each message carries an `isFile: true` flag so the preview can
 * label it as context rather than a regular user turn.
 */
export function buildContextMessages(state) {
  const messages = [];

  for (const file of state.contextFiles) {
    if (file.content && file.content.trim()) {
      messages.push({
        role: "user",
        content: CONTEXT_INTRO + file.content,
        isFile: true,
      });
    }
  }

  return messages;
}
