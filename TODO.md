# TODO — LLM Chat → Venice.ai Character Workbench

**RULE: Create branch. Complete ONE unchecked item, Test, Commit, then STOP. Do not proceed to the next item.**

**RULE: The user will either ask you to do some changes or say it is acceptable. When it is acceptable, merge branch into the main one.**

---

## Phase 1 — Two-Pane Layout

- [x] **1.1** Restructure `index.html` into a two-pane horizontal layout: `<div id="left-pane">` and `<div id="right-pane">` inside `<main>`. Move the chat container into the right pane. Left pane is empty for now.
- [ ] **1.2** Add a resizable divider between the two panes. Dragging the divider resizes the panes. Default split: 40% left / 60% right. Minimum pane width: 250px.
- [ ] **1.3** Add a horizontal tab bar at the top of the left pane with four tabs: "Instructions", "System Prompt", "Description", "First Response". Clicking a tab switches the content of a **single shared `<textarea>`** below (not one textarea per tab — reuse the same element and swap its content). The textarea must fill all vertical space between the tab bar and the bottom of the pane. No other UI elements in the left pane at this stage.
- [ ] **1.4** Style the left pane, tab bar, and textarea to match the existing dark theme in `styles.css`. Tabs use the accent color for the active state. The textarea has no border, fills 100% width/height, uses a monospace or readable font. Maximum editing space — no padding waste.
- [ ] **1.5** Add a token counter at the very bottom of the left pane, below the textarea. It displays an approximate token count for the current textarea content using a heuristic (e.g., `Math.ceil(content.length / 4)`). Update it on every input. Style it as small, subtle, secondary-colored text — it must not take space away from the textarea.

## Phase 2 — Filesystem Backend (Rust Commands)

- [ ] **2.1** Add a `load_file` Tauri command that takes a file path as a string and returns its contents as a string. Return an error if the file doesn't exist or can't be read.
- [ ] **2.2** Add a `save_file` Tauri command that takes a file path and content as strings. Creates the file if it doesn't exist, overwrites if it does. Return an error on failure.
- [ ] **2.3** Add a `list_characters` Tauri command that takes a work folder path and returns an array of subfolder names. Each subfolder is a character. Skip non-directory entries.
- [ ] **2.4** Add a `create_character` Tauri command that takes a work folder path and character name. It creates the subfolder and writes default empty files: `instructions.md`, `prompt.md`, `description.md`, `first-response.md`, and a `context/` directory. Return the character folder path.
- [ ] **2.5** Register all new commands in `tauri::Builder::invoke_handler`. Add `fs` and `path` to the Tauri allowlist in `tauri.conf.json` if needed for file access.

## Phase 3 — Work Folder & Character Selection

- [ ] **3.1** Add a "Work Folder" setting to the Settings modal. Store it in `localStorage` under key `llm-work-folder`. Add a corresponding input field in the modal. Default value: a `characters` folder next to the app executable.
- [ ] **3.2** On app init (and when work folder setting changes), call `list_characters` and populate a character selector dropdown in the header (or a sidebar element). If no characters exist, show a "Create Character" prompt.
- [ ] **3.3** Add a "New Character" button next to the selector. Clicking it shows a simple prompt for the character name, then calls `create_character`. On success, refresh the character list and auto-select the new character.

## Phase 4 — Editor ↔ File Wiring

- [ ] **4.1** When a character is selected, call `load_file` for each of the four character files (`instructions.md`, `prompt.md`, `description.md`, `first-response.md`) and populate the corresponding tab's textarea with the content. Do this in parallel.
- [ ] **4.2** Add an `oninput` listener to each textarea that, after a 1-second debounce, calls `save_file` to write the current content to the corresponding character file. This is auto-save.
- [ ] **4.3** If `save_file` returns an error during auto-save, display a non-blocking error notification at the top of the left pane (red banner with the error message). Dismiss it on the next successful save.

## Phase 5 — Git Versioning

- [ ] **5.1** Add `git2` crate to `Cargo.toml` dependencies.
- [ ] **5.2** In `create_character`, after creating the folder and default files, call `git2::Repository::init()` on the character folder. Then make an initial commit with message "Initial character" containing all default files.
- [ ] **5.3** Add a `git_commit` Tauri command that takes a character folder path and commit message string. It stages all files (`git add .`), commits with the message, and returns success or error.
- [ ] **5.4** Add a `git_log` Tauri command that takes a character folder path and returns an array of `{ id: String, message: String, timestamp: String }` for the last 50 commits (newest first).
- [ ] **5.5** Add a `git_revert` Tauri command that takes a character folder path and a commit id. It performs a hard checkout of that commit's tree, restoring all character files to that state. Return success or error.
- [ ] **5.6** Add a version control bar at the bottom of the left pane with a "Commit" button. Clicking it shows a small input for the commit message, then calls `git_commit`. On success, show a brief confirmation.
- [ ] **5.7** Add a "History" button next to "Commit". Clicking it calls `git_log` and shows a modal listing commits. Each commit has a "Revert to this" button that calls `git_revert`. On revert success, reload all character files into the editors.

## Phase 6 — Chat Features

- [ ] **6.1** Add a markdown renderer (e.g., `marked.js` via CDN or bundled) to the project. Apply markdown rendering in two places: (1) assistant message bubbles — replace `body.textContent = content` with `body.innerHTML = marked.parse(content)`, (2) user message bubbles — same markdown rendering. **Exception:** the edit input box (item 6.3) shows raw text, not rendered markdown.
- [ ] **6.2** Add a delete button (trash icon) to each message bubble on hover. Clicking delete removes that message and all messages below it from `conversationHistory` and from the DOM.
- [ ] **6.3** Add an edit button (pencil icon) to each message bubble on hover. Clicking it replaces the message content area with a plain `<textarea>` pre-filled with the original text (no markdown rendering in the edit box). A "Save" and "Cancel" button appear below it.
- [ ] **6.4** When "Save" is clicked on an edited message: update the message content in `conversationHistory`, remove all messages below it, remove their DOM elements, and re-trigger a streaming response from the LLM (as if the user sent the edited text as a new message).
- [ ] **6.5** Add a "Resend" button next to the send button (or replace send when a conversation exists). Clicking it: takes the current input text, deletes the last user message from `conversationHistory` and the DOM, appends the new user message, and triggers a new streaming response.

## Phase 7 — Context Folder

- [ ] **7.1** Add a `list_context_files` Tauri command that takes a character folder path and returns an array of file names inside the `context/` subdirectory (`.md` and `.txt` only).
- [ ] **7.2** Add a `create_context_file` Tauri command that takes a character folder path and file name. It creates an empty file in the `context/` directory.
- [ ] **7.3** Add a "Context" section below the four tabs in the left pane (or a fifth tab). It lists all context files for the current character with a "New File" button. Clicking a file opens it in the textarea (reusing the same editor). The "New File" button prompts for a name and calls `create_context_file`.
- [ ] **7.4** When building the messages array for an API call, read all context files and append their contents to the system prompt (or as additional system messages) so the LLM receives the full character context.

## Phase 8 — First Response Injection

- [ ] **8.1** When sending the first user message in a conversation, check if `first-response.md` has non-empty content. If it does, prepend an assistant message with that content to `conversationHistory` before the user message. Display this assistant message as the first bubble in the chat (with a subtle "First Response" label).

## Phase 9 — Venice.ai Compatibility & Polish

- [ ] **9.1** Add `https://api.venice.ai/api/v3/chat/completions` as a preset endpoint option in the Settings modal (dropdown or button to auto-fill).
- [ ] **9.2** Ensure the description tab content is clearly labeled as the "public-facing" description that will appear on Venice.ai character listings. Add placeholder text hinting at this purpose.
- [ ] **9.3** Test end-to-end: create a character, edit all tabs, verify auto-save, commit, revert, chat with markdown, edit/delete/resend messages, verify context files are included in prompts, verify first-response injection.
- [ ] **9.4** Final pass: clean up CSS inconsistencies, verify error handling paths, ensure the app window is appropriately sized (wider default to accommodate two panes — update `tauri.conf.json` width to ~1200).
