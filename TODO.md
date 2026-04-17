# TODO — LLM Chat → Venice.ai Character Workbench

**RULE: For every unchecked item, follow this workflow IN ORDER:**

1. **Create a feature branch** from `master` before writing any code.
   - Branch naming: `feature/<step-letter>-<short-description>` (e.g. `feature/a-work-folder-character-list`).
   - If you start implementing without creating a branch first, STOP — go back and create the branch.
2. **Complete ONE unchecked item.** Do not start the next item until the current one is accepted.
3. **Test the change.** Run `npm run dev` and verify the feature works.
4. **Commit** the change on the feature branch.
5. **STOP.** Wait for the user to review.
6. **When accepted**, merge the feature branch into `master` using `--no-ff` (never fast-forward) so the branch is visible in the git graph.

**RULE: The user will either ask you to do some changes or say it is acceptable. When it is acceptable, merge branch into the main one with `--no-ff`.**

**RULE: Each item is a vertical slice — backend + frontend together, testable end-to-end.**

---

## Phase 1 — Two-Pane Layout ✅

- [x] **1.1** Restructure `index.html` into a two-pane horizontal layout.
- [x] **1.2** Add a resizable divider between the two panes.
- [x] **1.3** Add a horizontal tab bar with four tabs and a shared textarea.
- [x] **1.4** Style the left pane, tab bar, and textarea to match the dark theme.
- [x] **1.5** Add a token counter below the textarea.

## Phase 2 — Filesystem Backend ✅

- [x] **2.1** Add a `load_file` Tauri command.
- [x] **2.2** Add a `save_file` Tauri command.
- [x] **2.3** Add a `list_characters` Tauri command.
- [x] **2.4** Add a `create_character` Tauri command.
- [x] **2.5** Register all new commands in `invoke_handler`.

---

## Remaining Work — Vertical Slices (each item is testable end-to-end)

- [x] **A. Work Folder Setting + Character List**
  Add a "Work Folder" input to the Settings modal. Store it in `localStorage` under key `llm-work-folder`. Default value: a `characters` folder next to the app executable. On app init (and whenever the work folder setting changes), call `list_characters` and populate a character selector dropdown in the header. If no characters exist, show a "No characters yet — create one" prompt in the dropdown area.

- [x] **B. New Character Creation**
  Add a "+" button next to the character selector. Clicking it prompts the user for a character name (simple browser `prompt()`), then calls `create_character`. On success, refresh the character list and auto-select the new character.

- [x] **C. Editor ↔ File Wiring (Load + Auto-Save)**
  When a character is selected, call `load_file` for all four character files (`instructions.md`, `prompt.md`, `description.md`, `first-response.md`) in parallel and populate the corresponding tabs. Add an `oninput` listener on the textarea that, after a 1-second debounce, calls `save_file` to write the current tab's content to the corresponding file. If `save_file` returns an error, display a non-blocking red error banner at the top of the left pane. Dismiss it on the next successful save.

- [ ] **D. Git Versioning (full stack)**
  Add `git2` crate to `Cargo.toml`. Add three Tauri commands: `git_commit` (stages all + commits with message), `git_log` (returns last 50 commits as `{ id, message, timestamp }`), `git_revert` (hard-checkout a commit's tree). Update `create_character` to `git2::Repository::init()` + initial commit after creating files. Add a version control bar at the bottom of the left pane with "Commit" and "History" buttons. Commit shows an inline input for the commit message, then calls `git_commit`. History opens a modal listing commits; each has a "Revert to this" button. On revert success, reload all character files into the editors.

- [ ] **E. Chat: Markdown Rendering**
  Add `marked.js` (via CDN or bundled). Render assistant message bubbles as markdown (`body.innerHTML = marked.parse(content)`). Render user message bubbles as markdown too. The edit input box (item F) shows raw text, not rendered markdown.

- [ ] **F. Chat: Delete, Edit, Resend**
  Add a delete button (trash icon) and edit button (pencil icon) to each message bubble on hover. Delete removes that message + all messages below it from `conversationHistory` and the DOM. Edit replaces the message content with a `<textarea>` pre-filled with raw text, plus "Save" and "Cancel" buttons. On Save: truncate `conversationHistory` at that point, remove subsequent DOM elements, and re-trigger streaming. Add a "Resend" button next to Send: it takes current input text, deletes the last user message, appends the new one, and triggers a new stream.

- [ ] **G. Context Folder (full stack)**
  Add `list_context_files` Tauri command (returns `.md`/`.txt` files from `context/` subdirectory). Add `create_context_file` Tauri command (creates empty file in `context/`). Add a "Context" section below the four tabs (or a fifth tab) listing context files for the current character with a "New File" button. Clicking a file opens it in the textarea (reusing the shared editor). When building the messages array for an API call, read all context files and append their contents to the system prompt.

- [ ] **H. First Response Injection**
  When sending the first user message in a conversation, check if `first-response.md` has non-empty content. If it does, prepend an assistant message with that content to `conversationHistory` before the user message. Display this assistant message as the first bubble in the chat with a subtle "First Response" label.

- [ ] **I. Venice.ai Compatibility & Polish**
  Add `https://api.venice.ai/api/v3/chat/completions` as a preset endpoint option in the Settings modal (button or dropdown to auto-fill). Label the description tab content clearly as "public-facing" for Venice.ai listings (add placeholder text). Increase default window width to ~1200 in `tauri.conf.json`. Final pass: clean up CSS inconsistencies, verify error handling paths, end-to-end test.