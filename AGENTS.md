# AGENTS.md — AI Context File

Purpose: Help any AI assistant quickly understand this project's structure, conventions, and current state.

---

## What This Project Is

**Character Scratch Pad** — a Tauri v2 desktop app for developing and testing AI characters (targeting Venice.ai compatibility). Two-pane layout: left pane edits character files, right pane is a chat interface that streams from OpenAI-compatible APIs.

- **Stack**: Rust backend (Tauri v2), vanilla HTML/CSS/JS frontend (no framework, no bundler)
- **Runtime**: Desktop app, no Node server at runtime
- **Dev command**: `npm run dev` (from project root)

---

## Project Structure

```
llm-chat/
├── package.json                # npm scripts: dev, build (tauri dev/build)
├── TODO.md                     # Feature checklist with branching rules — READ BEFORE WORKING
├── DOCUMENTATION.md             # Full design spec (outdated file layout, update when structure changes)
├── AGENTS.md                   # This file
├── src-tauri/
│   ├── Cargo.toml              # Rust dependencies
│   ├── tauri.conf.json         # Tauri window config, CSP, allowlist
│   └── src/
│       ├── main.rs             # Entry point: windows_subsystem, calls lib
│       ├── lib.rs              # tauri::Builder, AppState init, invoke_handler, plugin registration
│       ├── state.rs            # AppState struct (api_key, model, endpoint, client)
│       ├── types.rs            # ChatMessage, Settings, ChatCompletionRequest, ContextFile (with is_read_only)
│       └── commands/
│           ├── mod.rs           # Pub mod declarations
│           ├── stream_chat.rs   # send_message_stream — SSE streaming to frontend
│           ├── settings.rs      # update_settings, get_settings
│           ├── files.rs         # load_file, save_file, list_context_files, create_context_file, delete_context_file, copy_file_to_context, extract_pdf_text
│           ├── characters.rs    # list_characters, create_character, ensure_character_files (file integrity + git init)
│           └── git.rs           # git_commit, git_log, git_revert, git_is_dirty, git_diff_last, git_commit_amend, generate_checkpoint_name, git_list_head_folder, git_get_head_content
└── ui/
    ├── index.html              # SPA markup (script type="module")
    ├── styles.css              # Dark theme (CSS variables in :root)
    ├── app.js                  # Orchestrator: shared state/dom, init(), event wiring
    ├── chat.js                 # Send, stream listeners, message DOM helpers
    ├── settings.js             # Settings load/sync/save, modal open/close
    ├── characters.js           # Character list, select, create, file loading
    ├── context.js              # Context file sidebar: list, select, add, delete, drag & drop, PDF badge
    ├── editor.js               # Tab switching, auto-save, token counter, error banner, read-only mode
    ├── git.js                  # Git bar, history modal, dirty check
    ├── tracked-paths.js        # Tracked file/folder config constants
    ├── divider.js              # Pane divider drag logic
    └── src/
        └── editor-cm.mjs       # CodeMirror 6 editor setup, dark theme, read-only compartment
```

---

## Key Conventions

### Git Workflow
- Branch from `master` for each feature: `feature/<letter>-<short-description>`
- ONE feature per branch, ONE unchecked TODO item at a time
- Merge with `--no-ff` (never fast-forward) after user acceptance
- See `TODO.md` for the full workflow rules

### Rust Backend
- Tauri commands are `#[tauri::command]` functions in `commands/` modules
- Each command module is focused on one domain (streaming, settings, files, characters)
- `AppState` holds runtime config (api_key, model, endpoint) behind `Mutex<String>`
- New commands must be registered in `lib.rs` `invoke_handler![]`
- Frontend calls Rust via `window.__TAURI__.invoke("command_name", { args })`

### Frontend
- ES modules: `app.js` is the orchestrator, imports from domain modules
- Shared mutable state lives in `app.js` as `export const state = { ... }` — modules import and mutate directly
- Shared DOM refs live in `app.js` as `export const dom = { ... }` — modules access via `dom.elementId`
- Tauri APIs: `const { invoke } = window.__TAURI__;` at top of each module that needs it
- No framework, no bundler — plain JS with `<script type="module">`
- Dark theme uses CSS variables defined in `:root` block of `styles.css`

### Character File Layout (on disk)
```
<work-folder>/
└── <character-name>/
    ├── instructions.txt       # Character personality, traits, behaviour rules
    ├── system-prompt.txt      # System prompt for LLM
    ├── description.txt        # Public-facing description (for Venice.ai)
    ├── intro.txt              # Opening message the character "already said"
    └── context/              # Optional supplementary context files
        ├── lore.md
        └── ...
```

---

## Tauri Commands (Current)

| Command | File | Purpose |
|---------|------|---------|
| `send_message_stream` | `commands/stream_chat.rs` | Stream chat completions via SSE, emits `stream-token` and `stream-end` events |
| `update_settings` | `commands/settings.rs` | Sync API key/model/endpoint to Rust state |
| `get_settings` | `commands/settings.rs` | Read current settings from Rust state |
| `load_file` | `commands/files.rs` | Read a file from disk |
| `save_file` | `commands/files.rs` | Write content to file (creates parent dirs) |
| `list_context_files` | `commands/files.rs` | List `.md`/`.txt`/`.pdf` files in a character's `context/` dir, return name + content + isReadOnly; PDFs have text extracted via lopdf |
| `create_context_file` | `commands/files.rs` | Create a new empty file in a character's `context/` dir |
| `delete_context_file` | `commands/files.rs` | Delete a file from a character's `context/` dir |
| `copy_file_to_context` | `commands/files.rs` | Copy an external file into a character's `context/` dir (supports `.txt`/`.md`/`.pdf`, resolves name collisions) |
| `extract_pdf_text` | `commands/files.rs` | Extract text from a PDF file using lopdf (internal helper, not a Tauri command) |
| `list_characters` | `commands/characters.rs` | List non-hidden directories in work folder |
| `create_character` | `commands/characters.rs` | Create character dir + delegate to `ensure_character_files` |
| `ensure_character_files` | `commands/characters.rs` | Ensure all essential files, context dir, and git repo exist for a character; create missing ones and make initial commit if repo is empty |
| `git_commit` | `commands/git.rs` | Stage all + commit with message |
| `git_log` | `commands/git.rs` | Return last 50 commits as { id, message, timestamp } |
| `git_revert` | `commands/git.rs` | Hard-reset to a commit's tree, reload files |
| `git_is_dirty` | `commands/git.rs` | Check if working tree has uncommitted changes (used as fallback for empty repos) |
| `git_get_head_content` | `commands/git.rs` | Read a file's content at HEAD commit; returns `null` if file doesn't exist at HEAD, repo is empty, or content is binary |
| `git_list_head_folder` | `commands/git.rs` | List files in a folder at HEAD commit; used to detect context file deletions in dirty check |
| `git_diff_last` | `commands/git.rs` | Return diff of last commit (truncated to 4000 chars) |
| `git_commit_amend` | `commands/git.rs` | Rename last commit's message |
| `generate_checkpoint_name` | `commands/git.rs` | Call LLM to generate a 3-6 word checkpoint name from diff |

---

## Frontend Module Map

| Module | Exports | Depends On |
|--------|---------|-------------|
| `app.js` | `state`, `dom`, `TAB_FILE_MAP`, `TRACKED_FOLDERS` | All other modules (imports them), `tracked-paths.js` |
| `chat.js` | `initStreamListeners`, `handleSend`, `createMessageElement`, `addMessage`, `addErrorMessage`, `scrollToBottom`, `autoResizeInput`, `showWelcome` | `app.js` (state, dom) |
| `settings.js` | `openSettingsModal`, `closeSettingsModal`, `loadSettingsFromStorage`, `syncSettingsToBackend`, `handleSaveSettings` | `app.js` (state, dom), `characters.js` (loadCharacters), `editor.js` (updateTokenCounter) |
| `characters.js` | `loadCharacters`, `handleCharacterSelect`, `openNewCharacterModal`, `closeNewCharacterModal`, `handleCreateCharacter` | `app.js` (state, dom), `editor.js` (updateTokenCounter, updateInstructionsVisibility), `settings.js` (openSettingsModal) |
| `context.js` | `renderContextFileList`, `loadContextFiles`, `selectContextFile`, `addContextFile`, `deleteContextFile`, `clearContextSelection`, `initContext` | `app.js` (state, dom), `editor.js` (setEditorValue, setEditorPlaceholder, getEditorValue, setEditorReadOnly), `git.js` (checkDirty) |
| `editor.js` | `saveCurrentTab`, `showSaveError`, `hideSaveError`, `switchTab`, `updateTokenCounter`, `setEditorReadOnly`, `updateInstructionsVisibility` | `app.js` (state, dom), `git.js` (checkDirty) |
| `divider.js` | `initPaneDivider` | None (uses DOM directly) |
| `git.js` | `initGit`, `updateGitBarVisibility`, `checkDirty`, `openGitHistory`, `closeGitHistory` | `app.js` (state, dom, TAB_FILE_MAP, TRACKED_FOLDERS), `editor.js` (showSaveError, getEditorValue), `characters.js` (handleCharacterSelect) |
| `tracked-paths.js` | `TRACKED_TAB_FILES`, `TRACKED_FOLDERS` | None (config module) |

**Circular dependency note**: `settings.js` ↔ `characters.js` — both import from each other. This works with ES modules because imports are resolved lazily (functions are called at runtime, not at module evaluation time).

---

## Dependencies

### Rust (src-tauri/Cargo.toml)
- `tauri` 2.x — desktop framework, IPC, events (no extra features required)
- `tauri-plugin-dialog` 2.x — native file/message dialogs
- `tauri-plugin-shell` 2.x — shell open utility
- `reqwest` 0.13 — HTTP client with streaming (`features = ["json", "stream"]`)
- `serde` 1 — serialization (`features = ["derive"]`)
- `serde_json` 1 — JSON handling
- `futures-util` 0.3 — SSE stream processing (`StreamExt`)
- `git2` 0.20 — local git operations for version control
- `lopdf` 0.34 — PDF text extraction for context files

### JS (no package.json deps at runtime)
- `@tauri-apps/cli` — dev tool only
- No npm runtime dependencies — Tauri exposes `window.__TAURI__` globals

---

## Current TODO Status (summary)

- ✅ Phase 1: Two-pane layout
- ✅ Phase 2: Filesystem backend commands
- ✅ A: Work folder setting + character list
- ✅ B: New character creation
- ✅ C: Editor ↔ file wiring (load + auto-save)
- ✅ D: Git versioning (commit/log/revert + dirty indicator + AI checkpoint naming)
- ✅ E: Chat markdown rendering
- ✅ F: Message delete/edit/resend
- ✅ G: Context folder management
- 🔲 H: First response injection
- 🔲 I: Venice.ai compatibility & polish

---

## Dependency Policy
- NEVER assume a dependency version from memory
- ALWAYS verify the latest stable version via web search or Context7 before writing it
- If a dependency has a major version bump since the model's training, use the new major version and adapt the API accordingly
- 
## Quick Reference

- **Start dev**: `cd llm-chat && npm run dev`
- **Build**: `npm run build`
- **Check Rust**: `cd src-tauri && cargo check`
- **Tauri config**: `src-tauri/tauri.conf.json`
- **Add new Tauri command**: Create in `commands/`, pub mod in `commands/mod.rs`, register in `main.rs` invoke_handler
- **Add new JS module**: Import in `app.js`, wire event listeners in `init()`
- **Theme variables**: `ui/styles.css` `:root` block