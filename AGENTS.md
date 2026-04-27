# AGENTS.md — AI Context File

Purpose: help any AI assistant quickly understand this project's current structure, conventions, and feature status.

---

## What This Project Is

**Character Scratch Pad** is a Tauri v2 desktop app for creating, editing, and testing AI characters against OpenAI-compatible chat APIs, with Venice.ai as a primary target.

- **Stack**: Rust backend (Tauri v2), vanilla HTML/CSS/JS frontend, CodeMirror 6 editor bundle
- **Runtime**: desktop app only; no Node server at runtime
- **Dev command**: `npm run dev`
- **Bundle step**: `npm run bundle` builds `ui/lib/editor-cm.bundle.js` from `ui/src/editor-cm.mjs`

The UI is a two-pane workbench:

- **Left pane**: character files, context files, prompt preview, checkpoint/history controls
- **Right pane**: streaming chat, message editing/deleting/resending, prompt preview per message

There is also a **Scratchpad (no save)** mode when no character is selected.

---

## Project Structure

```text
llm-chat/
├── README.md
├── DOCUMENTATION.md
├── TODO.md
├── AGENTS.md
├── package.json                # npm scripts: dev, build, bundle, test, clean
├── vitest.config.js            # Vitest config for ui/**/*.test.js
├── .github/
│   └── workflows/
│       ├── ci.yml              # cargo check/clippy/test + vitest
│       └── release.yml
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── src/
│   │   ├── main.rs             # Windows subsystem stub, calls lib::run()
│   │   ├── lib.rs              # Tauri builder, AppState init, invoke_handler registration
│   │   ├── state.rs            # AppState: api_key, model, endpoint, temperature, top_p, client
│   │   ├── types.rs            # ChatMessage, Settings, ContextFile, TestConnectionResult
│   │   └── commands/
│   │       ├── mod.rs
│   │       ├── characters.rs   # character list/create + ensure files/repo
│   │       ├── files.rs        # load/save/context file management + PDF extraction
│   │       ├── git.rs          # checkpoint/history/revert/head-content helpers
│   │       ├── http.rs         # shared OpenAI-compatible URL/auth request helpers
│   │       ├── line_endings.rs # shared CRLF/CR → LF normalization helper
│   │       ├── models.rs       # fetch_models from <base>/models
│   │       ├── settings.rs     # settings.json persistence + endpoint migration
│   │       ├── stream_chat.rs  # streaming chat completions
│   │       ├── test_connection.rs # endpoint/key/model test helpers
│   │       └── validation.rs   # shared path/filename safety checks
│   └── tests/
│       ├── character_workflow.rs
│       ├── context_files.rs
│       ├── files_edge_cases.rs
│       ├── git_workflow.rs
│       └── common.rs
└── ui/
    ├── index.html
    ├── styles.css
    ├── app.js
    ├── characters.js
    ├── chat.js
    ├── context.js
    ├── divider.js
    ├── editor.js
    ├── git.js
    ├── helpers.js              # shared markdown, prompt, state-sync, path/error helpers
    ├── preview.js
    ├── settings.js
    ├── tracked-paths.js
    ├── *.test.js               # Vitest coverage for core UI modules
    ├── lib/
    │   ├── dompurify.min.js
    │   ├── marked.min.js
    │   └── editor-cm.bundle.js
    └── src/
        └── editor-cm.mjs       # CodeMirror source bundled into ui/lib/
```

---

## Key Conventions

### Git Workflow

- The active primary branch in this repo is **`main`**.
- If you are working from `TODO.md`, use one feature branch per unchecked item: `feature/<step-letter>-<short-description>`.
- Merge accepted feature branches back into `main` with `--no-ff`.
- Character folders created by the app each get their **own local git repo** for checkpointing.

### Rust Backend

- Tauri commands live in `src-tauri/src/commands/`.
- Every new command must be registered in `src-tauri/src/lib.rs`.
- `AppState` stores runtime settings in `Mutex`s:
  - `api_key`
  - `model`
  - `endpoint`
  - `temperature`
  - `top_p`
  - shared `reqwest::Client`
- The app stores the **API base URL**, not the full chat-completions URL.
  - Example stored value: `https://api.openai.com/v1`
  - Rust appends `/chat/completions` when sending chat requests
  - Model fetching uses `/models`
- Settings persist to `settings.json` next to the executable; `get_settings` also migrates older saved endpoints that included `/chat/completions`.
- Reuse shared backend helpers before adding command-local duplication:
  - `commands/http.rs` for OpenAI-compatible URL construction and auth headers
  - `commands/line_endings.rs` for CRLF/CR → LF text normalization
  - `commands/validation.rs` for path traversal and hidden-name checks

### Frontend

- ES modules; `ui/app.js` owns shared `state` and `dom` exports.
- Frontend invokes Tauri with `window.__TAURI__.core.invoke(...)`.
- Shared editor state lives in `state.tabContents`; context files live in `state.contextFiles`.
- The editor is **CodeMirror 6**, not a plain `<textarea>`.
- Markdown rendering uses local `marked.min.js` + `dompurify.min.js` from `ui/lib/`.
- Shared frontend helper seams live in `ui/helpers.js` for sanitized markdown rendering, prompt assembly, live editor-state sync, error formatting, and character path helpers.
- Settings UI supports:
  - model discovery from `/models`
  - endpoint/API key connection testing
  - model testing
  - temperature and top-p sliders
- A warning banner/icon appears if `instructions.txt` has content but `system-prompt.txt` does **not** contain `%%CHARACTER_INSTRUCTIONS%%`.
- Providers that stream `reasoning_content` or `reasoning` emit a `stream-thinking` event; assistant messages with thinking content show a 🧠 button that opens the Thinking Process modal.
- Context file creation uses the in-app New Context File modal instead of `prompt()`.

### Character File Layout

```text
<work-folder>/
└── <character-name>/
    ├── .git/
    ├── instructions.txt
    ├── system-prompt.txt
    ├── description.txt
    ├── intro.txt
    └── context/
        ├── lore.md
        ├── notes.txt
        ├── reference.pdf
        └── ...
```

Notes:

- `intro.txt` content is synced to a first-response assistant bubble via `syncFirstResponse()` in `chat.js`. The bubble is injected on character load and on intro edits, removed when intro is cleared, and guarded against mutating non-empty chats. An internal `_isFirstResponse` marker is stripped from API payloads.
- Context files support `.txt`, `.md`, and `.pdf`.
- PDFs are read-only in the editor; text is extracted backend-side with `lopdf`.

---

## Tauri Commands (Current)

| Command | File | Purpose |
|---|---|---|
| `send_message_stream` | `commands/stream_chat.rs` | POSTs to `<endpoint>/chat/completions`, streams SSE tokens back as `stream-token` / `stream-end` |
| `update_settings` | `commands/settings.rs` | Updates in-memory settings and persists them to `settings.json` |
| `get_settings` | `commands/settings.rs` | Loads settings from disk, migrates legacy endpoints, syncs AppState |
| `load_file` | `commands/files.rs` | Reads a text file from disk and normalizes line endings to LF |
| `save_file` | `commands/files.rs` | Writes a text file, creating parent dirs and normalizing line endings |
| `list_context_files` | `commands/files.rs` | Lists `.md` / `.txt` / `.pdf` context files; PDFs return extracted text and `isReadOnly` |
| `create_context_file` | `commands/files.rs` | Creates a new empty context file (defaults to `.txt` if no supported extension is supplied) |
| `delete_context_file` | `commands/files.rs` | Deletes a context file safely from `context/` |
| `copy_file_to_context` | `commands/files.rs` | Copies an external `.txt` / `.md` / `.pdf` file into `context/`, resolving collisions |
| `list_characters` | `commands/characters.rs` | Lists non-hidden directories in the configured work folder |
| `create_character` | `commands/characters.rs` | Creates a character directory and delegates initialization to `ensure_character_files` |
| `ensure_character_files` | `commands/characters.rs` | Ensures required files, `context/`, and local git repo exist; creates initial commit if needed |
| `git_commit` | `commands/git.rs` | Stages everything except `.git` internals and creates a commit |
| `git_log` | `commands/git.rs` | Returns recent commit history plus `is_current` flag |
| `git_revert` | `commands/git.rs` | Hard-resets a character repo to a chosen commit |
| `git_is_dirty` | `commands/git.rs` | Fallback dirty-state check |
| `git_get_head_content` | `commands/git.rs` | Reads a file from HEAD for clean/dirty comparisons |
| `git_list_head_folder` | `commands/git.rs` | Lists folder contents from HEAD for deleted-context-file detection |
| `git_diff_last` | `commands/git.rs` | Returns the latest commit diff, truncated for checkpoint naming |
| `git_commit_amend` | `commands/git.rs` | Renames the latest commit |
| `generate_checkpoint_name` | `commands/git.rs` | Uses the configured LLM to generate a short checkpoint name from a diff |
| `fetch_models` | `commands/models.rs` | GETs `<base>/models` and returns model IDs |
| `test_connection` | `commands/test_connection.rs` | Tests endpoint + API key with structured error classification |
| `test_model` | `commands/test_connection.rs` | Tests whether a specific model works at the configured provider |

Internal helper modules in `commands/http.rs`, `commands/line_endings.rs`, and `commands/validation.rs` are not Tauri commands, but they are part of the current architecture and should be reused when touching HTTP calls, text normalization, or path/filename validation.

---

## Frontend Module Map

| Module | Responsibility |
|---|---|
| `app.js` | Global state/DOM registry, app bootstrap, event wiring, settings-driven UI enable/disable, first-response sync on intro edits |
| `chat.js` | Streaming chat, thinking modal, message rendering, delete/edit/resend, prompt assembly, per-message preview, first-response sync |
| `characters.js` | Work-folder character list, create modal, character load/reload logic, scratchpad mode, first-response sync on load/revert |
| `context.js` | Context sidebar rendering, modal-based create/delete flows, active-file saving, native drag & drop imports |
| `editor.js` | CodeMirror helpers, autosave, tab switching, token counter, instructions visibility warning |
| `git.js` | Dirty detection against HEAD, checkpoint save flow, history modal, restore flow |
| `helpers.js` | Shared markdown rendering, prompt builders, live editor-state sync, error formatting, character path helpers |
| `preview.js` | Full prompt preview modal and shared preview rendering |
| `settings.js` | Settings load/save/sync, `/models` combobox, connection/model tests |
| `tracked-paths.js` | Tracked files/folders config for dirty checking |
| `divider.js` | Resizable left/right pane divider |

---

## Testing & Automation

### Rust

- Integration tests live in `src-tauri/tests/`
- Coverage currently includes:
  - character lifecycle
  - git workflow
  - context file workflow
  - file edge cases / path safety / line ending normalization

### Frontend

- Vitest runs in `jsdom`
- Test files live beside the UI modules, for example:
  - `chat.test.js`
  - `characters.test.js`
  - `context.test.js`
  - `editor.test.js`
  - `git.test.js`
  - `settings.test.js`
  - `tracked-paths.test.js`

### CI

`.github/workflows/ci.yml` runs:

- `cargo check`
- `cargo clippy -- -D warnings`
- `cargo test`
- `npm test`

Node.js in CI is currently pinned to **24**.

---

## Current Feature Status (Summary)

### Core feature slices

- ✅ Two-pane layout
- ✅ Character file load/save
- ✅ Work folder and character list
- ✅ Character creation modal
- ✅ Git-backed checkpoints/history/revert
- ✅ Markdown chat rendering
- ✅ Message delete/edit/resend
- ✅ Context folder management with PDF extraction

### Additional shipped improvements beyond the original slices

- ✅ Prompt preview modal
- ✅ Per-message preview of the assembled prompt context
- ✅ Settings persisted to `settings.json`
- ✅ Provider model discovery from `/models`
- ✅ Endpoint/API key test button
- ✅ Model test button
- ✅ Temperature / top-p controls
- ✅ Error notification bar in chat
- ✅ Instructions invisibility warning/banner
- ✅ First-response injection from `intro.txt` with guarded sync, visual label, and API serialization
- ✅ Thinking/reasoning streaming display with brain-icon modal
- ✅ Modal-based context file creation flow
- ✅ Rust + Vitest automated test suites

### Still incomplete

- ✅ Venice.ai preset/polish work completed

---

## Dependency Policy

- Never assume dependency versions from memory.
- Verify versions from the actual repo (`package.json`, `Cargo.toml`) or authoritative docs.
- Prefer documenting **current repository reality** over older plans.

---

## Quick Reference

- **Install deps**: `npm install`
- **Start dev app**: `npm run dev`
- **Bundle editor only**: `npm run bundle`
- **Run JS tests**: `npm test`
- **Run Rust tests**: `cargo test` (from `src-tauri/`)
- **Check Rust compile**: `cargo check` (from `src-tauri/`)
- **Build desktop app**: `npm run build`
- **Settings file**: next to the built executable as `settings.json`
- **Tauri config**: `src-tauri/tauri.conf.json`
