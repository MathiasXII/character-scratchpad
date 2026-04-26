# TODO — Character Scratch Pad

This file tracks the original vertical-slice roadmap plus newer completed improvements so the current state is clear.

**RULE: For every unchecked item, follow this workflow IN ORDER:**

1. **Create a feature branch** from `main` before writing code.
   - Branch naming: `feature/<step-letter>-<short-description>` (example: `feature/h-first-response-injection`).
2. **Complete ONE unchecked item.** Do not start the next unchecked item until the current one is accepted.
3. **Test the change.** Run the relevant automated checks and verify the feature manually in the app when appropriate.
4. **Commit** the change on the feature branch.
5. **STOP.** Wait for review.
6. **When accepted**, merge the feature branch into `main` using `--no-ff` so the branch remains visible in git history.

**RULE: Each unchecked item is a vertical slice — backend + frontend together, testable end-to-end.**

---

## Core Roadmap

### Phase 1 — Two-Pane Layout ✅

- [x] **1.1** Restructure `index.html` into a two-pane horizontal layout.
- [x] **1.2** Add a resizable divider between the two panes.
- [x] **1.3** Add a horizontal tab bar with four character tabs plus a context tab.
- [x] **1.4** Style the left pane, tab bar, and editor to match the dark theme.
- [x] **1.5** Add a token counter below the editor.

### Phase 2 — Filesystem Backend ✅

- [x] **2.1** Add a `load_file` Tauri command.
- [x] **2.2** Add a `save_file` Tauri command.
- [x] **2.3** Add a `list_characters` Tauri command.
- [x] **2.4** Add a `create_character` Tauri command.
- [x] **2.5** Register the commands in `src-tauri/src/lib.rs` `invoke_handler![]`.

---

## Remaining Work — Original Vertical Slices

- [x] **A. Work Folder Setting + Character List**
  Add a Work Folder picker to Settings, store it in `localStorage`, and load the character selector from that folder. When no character is selected, the app should support a scratchpad mode with no file-backed saving.

- [x] **B. New Character Creation**
  Add a dedicated create-character modal, create the folder, refresh the list, and auto-select the new character.

- [x] **C. Editor ↔ File Wiring (Load + Auto-Save)**
  When a character is selected, load `instructions.txt`, `system-prompt.txt`, `description.txt`, and `intro.txt` in parallel and wire the shared editor to auto-save changes with a debounce. Surface save failures in a dismissible error banner.

- [x] **D. Git Versioning (full stack)**
  Add per-character git repositories, checkpoint commits, history, restore, dirty-state indication, and background AI checkpoint renaming.

- [x] **E. Chat: Markdown Rendering**
  Render both user and assistant message bubbles as sanitized markdown.

- [x] **F. Chat: Delete, Edit, Resend**
  Support deleting a message and all later messages, editing a message in place, and re-running the conversation from the last user turn.

- [x] **G. Context Folder (full stack)**
  Add context file list/create/delete/copy support, drag & drop import, PDF extraction with read-only editing, and include non-empty context files as separate prompt messages.

- [ ] **H. First Response Injection**
  When sending the first user message in a conversation, check whether `intro.txt` has non-empty content. If it does, prepend an assistant message with that content before the first user turn and display it with a subtle First Response label.

- [ ] **I. Venice.ai Compatibility & Polish**
  Add a built-in Venice.ai settings preset using the base URL `https://api.venice.ai/api/v1`, label the description content clearly as public-facing, and do a final polish pass on UX and error handling.

---

## Additional Work Already Completed After The Original Plan

- [x] **J. Prompt Preview**
  Add a Preview modal for the assembled prompt and per-message preview buttons that show the exact context used for a given chat turn.

- [x] **K. Provider Tooling In Settings**
  Persist backend settings to `settings.json`, fetch models from `/models`, add Test Connection and Test Model actions, and expose temperature/top-p controls.

- [x] **L. Error Notification UX**
  Add a dismissible chat error notification area so API and streaming failures are visible without corrupting the conversation layout.

- [x] **M. Instructions Visibility Warning**
  Warn the user when `instructions.txt` has content but `system-prompt.txt` does not include `%%CHARACTER_INSTRUCTIONS%%`, so the instructions would be ignored at send time.

- [x] **N. Automated Tests & CI**
  Add Vitest coverage for UI modules, Rust integration tests for backend workflows, and CI that runs cargo checks/tests plus JS tests.
