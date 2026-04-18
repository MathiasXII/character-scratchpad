# AGENTS.md — AI Context File

Purpose: Help any AI assistant quickly understand this project's structure, conventions, and current state.

---

## What This Project Is

**LLM Chat** — a Tauri 1.x desktop app for developing and testing AI characters (targeting Venice.ai compatibility). Two-pane layout: left pane edits character files, right pane is a chat interface that streams from OpenAI-compatible APIs.

- **Stack**: Rust backend (Tauri v1), vanilla HTML/CSS/JS frontend (no framework, no bundler)
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
│       ├── main.rs             # Entry point: tauri::Builder, AppState init, invoke_handler
│       ├── state.rs            # AppState struct (api_key, model, endpoint, client)
│       ├── types.rs            # ChatMessage, Settings, ChatCompletionRequest
│       └── commands/
│           ├── mod.rs           # Pub mod declarations
│           ├── stream_chat.rs   # send_message_stream — SSE streaming to frontend
│           ├── settings.rs      # update_settings, get_settings
│           ├── files.rs         # load_file, save_file
│           ├── characters.rs    # list_characters, create_character, ensure_character_files (file integrity + git init)
│           └── git.rs           # git_commit, git_log, git_revert, git_is_dirty, git_diff_last, git_commit_amend, generate_checkpoint_name
└── ui/
    ├── index.html              # SPA markup (script type="module")
    ├── styles.css              # Dark theme (CSS variables in :root)
    ├── app.js                  # Orchestrator: shared state/dom, init(), event wiring
    ├── chat.js                 # Send, stream listeners, message DOM helpers
    ├── settings.js             # Settings load/sync/save, modal open/close
    ├── characters.js           # Character list, select, create, file loading
    ├── editor.js               # Tab switching, auto-save, token counter, error banner
    └── divider.js              # Pane divider drag logic
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
- New commands must be registered in `main.rs` `invoke_handler![]`
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
| `list_context_files` | `commands/files.rs` | List `.md`/`.txt` files in a character's `context/` dir, return name + content |
| `list_characters` | `commands/characters.rs` | List non-hidden directories in work folder |
| `create_character` | `commands/characters.rs` | Create character dir + delegate to `ensure_character_files` |
| `ensure_character_files` | `commands/characters.rs` | Ensure all essential files, context dir, and git repo exist for a character; create missing ones and make initial commit if repo is empty |
| `git_commit` | `commands/git.rs` | Stage all + commit with message |
| `git_log` | `commands/git.rs` | Return last 50 commits as { id, message, timestamp } |
| `git_revert` | `commands/git.rs` | Hard-reset to a commit's tree, reload files |
| `git_is_dirty` | `commands/git.rs` | Check if working tree has uncommitted changes |
| `git_diff_last` | `commands/git.rs` | Return diff of last commit (truncated to 4000 chars) |
| `git_commit_amend` | `commands/git.rs` | Rename last commit's message |
| `generate_checkpoint_name` | `commands/git.rs` | Call LLM to generate a 3-6 word checkpoint name from diff |

---

## Frontend Module Map

| Module | Exports | Depends On |
|--------|---------|-------------|
| `app.js` | `state`, `dom` | All other modules (imports them) |
| `chat.js` | `initStreamListeners`, `handleSend`, `createMessageElement`, `addMessage`, `addErrorMessage`, `scrollToBottom`, `autoResizeInput`, `showWelcome` | `app.js` (state, dom) |
| `settings.js` | `openSettingsModal`, `closeSettingsModal`, `loadSettingsFromStorage`, `syncSettingsToBackend`, `handleSaveSettings` | `app.js` (state, dom), `characters.js` (loadCharacters), `editor.js` (updateTokenCounter) |
| `characters.js` | `loadCharacters`, `handleCharacterSelect`, `openNewCharacterModal`, `closeNewCharacterModal`, `handleCreateCharacter` | `app.js` (state, dom), `editor.js` (updateTokenCounter), `settings.js` (openSettingsModal) |
| `editor.js` | `saveCurrentTab`, `showSaveError`, `hideSaveError`, `switchTab`, `updateTokenCounter` | `app.js` (state, dom), `git.js` (checkDirty) |
| `divider.js` | `initPaneDivider` | None (uses DOM directly) |
| `git.js` | `initGit`, `updateGitBarVisibility`, `checkDirty`, `openGitHistory`, `closeGitHistory` | `app.js` (state, dom), `editor.js` (showSaveError), `characters.js` (handleCharacterSelect) |

**Circular dependency note**: `settings.js` ↔ `characters.js` — both import from each other. This works with ES modules because imports are resolved lazily (functions are called at runtime, not at module evaluation time).

---

## Dependencies

### Rust (src-tauri/Cargo.toml)
- `tauri` 1.x — desktop framework, IPC, events (`features = ["dialog-open", "shell-open"]`)
- `reqwest` 0.11 — HTTP client with streaming (`features = ["json", "stream"]`)
- `serde` 1 — serialization (`features = ["derive"]`)
- `serde_json` 1 — JSON handling
- `futures-util` 0.3 — SSE stream processing
- `git2` 0.20 — local git operations for version control

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
- 🔲 E: Chat markdown rendering
- 🔲 F: Message delete/edit/resend
- 🔲 G: Context folder management
- 🔲 H: First response injection
- 🔲 I: Venice.ai compatibility & polish

---

## Quick Reference

- **Start dev**: `cd llm-chat && npm run dev`
- **Build**: `npm run build`
- **Check Rust**: `cd src-tauri && cargo check`
- **Tauri config**: `src-tauri/tauri.conf.json`
- **Add new Tauri command**: Create in `commands/`, pub mod in `commands/mod.rs`, register in `main.rs` invoke_handler
- **Add new JS module**: Import in `app.js`, wire event listeners in `init()`
- **Theme variables**: `ui/styles.css` `:root` block