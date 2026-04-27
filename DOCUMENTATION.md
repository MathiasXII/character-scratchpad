# Character Scratch Pad — Current Architecture & Feature Documentation

## 1. Project Overview

**Character Scratch Pad** is a Tauri v2 desktop application for creating, editing, and testing AI characters against OpenAI-compatible chat APIs. It is designed around a local, file-based workflow that fits Venice.ai-style character authoring, while still supporting other providers that expose compatible `/chat/completions` and `/models` endpoints.

The application combines three workflows in one desktop tool:

1. **Character authoring** — edit character files directly on disk
2. **Prompt inspection** — preview the assembled prompt before or after chat turns
3. **Live validation** — stream responses from an LLM provider while iterating on the files

---

## 2. Architecture

| Layer | Technology | Role |
|---|---|---|
| Native shell | **Tauri v2** | Desktop window, IPC bridge, filesystem access, packaging |
| Backend | **Rust** (`src-tauri/src/`) | Settings persistence, file operations, git operations, HTTP requests, SSE streaming |
| Frontend | **Vanilla HTML/CSS/JS** (`ui/`) | UI rendering, CodeMirror integration, chat UX, modals, previews |
| Editor bundle | **CodeMirror 6** | Rich editor for tracked character files and editable context files |

### Why Tauri?

Tauri fits the project because the app needs native capabilities without Electron overhead:

- direct filesystem access for character folders
- local git repositories per character
- backend-managed streaming requests
- native drag-and-drop file imports
- cross-platform desktop packaging

---

## 3. Current Application State

The project is no longer a basic chat prototype. The current app includes:

- **Two-pane workbench** with a draggable divider
- **Character selection and creation** inside a configurable work folder
- **Scratchpad mode** when no character is selected
- **CodeMirror-based editor** with autosave for tracked files
- **Context file management** for `.txt`, `.md`, and `.pdf`
- **Read-only PDF extraction** via `lopdf`
- **Streaming chat** over OpenAI-compatible APIs
- **Markdown rendering** for both user and assistant messages
- **Delete, edit, and resend** chat actions
- **Prompt preview** for the assembled prompt and per-message context
- **Thinking/reasoning display** for providers that stream `reasoning_content` or `reasoning` deltas
- **Modal-based context file creation** instead of browser-native prompts
- **Per-character git checkpoints** with restore/history support
- **Provider tooling in Settings**:
  - fetch models from `/models`
  - test endpoint/API key
  - test a specific model
  - tune `temperature` and `top_p`
- **Persistent backend settings** via `settings.json`
- **Rust integration tests, Vitest UI tests, and CI**

### Still incomplete

All original roadmap items are now complete. The app is in a stable v1.0 state.

`intro.txt` content is automatically injected into the chat as a guarded first-response assistant bubble.

---

## 4. Source Layout

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
│   │       ├── characters.rs
│   │       ├── files.rs
│   │       ├── git.rs
│   │       ├── http.rs
│   │       ├── line_endings.rs
│   │       ├── models.rs
│   │       ├── settings.rs
│   │       ├── stream_chat.rs
│   │       ├── test_connection.rs
│   │       └── validation.rs
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
    ├── helpers.js
    ├── preview.js
    ├── settings.js
    ├── tracked-paths.js
    ├── *.test.js
    ├── lib/
    │   ├── dompurify.min.js
    │   ├── marked.min.js
    │   └── editor-cm.bundle.js
    └── src/
        └── editor-cm.mjs
```

---

## 5. Character Project Layout

Each character is stored as a folder inside the configured work folder:

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

### File roles

| File | Purpose |
|---|---|
| `instructions.txt` | Character behaviour, tone, personality, rules |
| `system-prompt.txt` | Main system prompt template sent to the model |
| `description.txt` | Public-facing description text |
| `intro.txt` | First assistant response injected into an empty chat on character load |
| `context/*` | Optional supporting documents injected as prompt context |

### Creation and integrity rules

When a character is created or ensured:

- missing core files are created empty
- `context/` is created if needed
- a local git repository is initialised if missing
- an `Initial commit` is created if the repo has no commits yet

---

## 6. Settings & Persistence

### Storage model

| Setting | Stored in `settings.json` | Stored in `localStorage` |
|---|---:|---:|
| API key | ✅ | ✅ |
| Model | ✅ | ✅ |
| Endpoint base URL | ✅ | ✅ |
| Temperature | ✅ | ✅ |
| Top P | ✅ | ✅ |
| Work folder | ❌ | ✅ |

### Important endpoint detail

The app stores the **base API URL**, not the full chat-completions URL.

Examples:

- OpenAI: `https://api.openai.com/v1`
- Venice.ai: `https://api.venice.ai/api/v1`

The backend appends:

- `/chat/completions` for chat requests
- `/models` for model discovery

Older docs that mention storing the full `/chat/completions` URL are outdated. The backend also migrates previously saved full URLs by stripping that suffix.

---

## 7. Backend Commands

The current Tauri command surface is:

| Command | Purpose |
|---|---|
| `send_message_stream` | Send a streaming chat-completions request |
| `update_settings` | Persist and sync the current backend settings |
| `get_settings` | Load settings from disk and hydrate `AppState` |
| `load_file` | Read a text file from disk |
| `save_file` | Write a text file, creating parent directories if needed |
| `list_context_files` | Return context files and extracted PDF content |
| `create_context_file` | Create a new empty context file |
| `delete_context_file` | Delete a context file safely |
| `copy_file_to_context` | Copy an external supported file into `context/` |
| `list_characters` | List non-hidden character directories |
| `create_character` | Create a character directory |
| `ensure_character_files` | Ensure files, context directory, and git repo exist |
| `git_commit` | Commit current character files |
| `git_log` | Return checkpoint history |
| `git_revert` | Restore a selected commit |
| `git_is_dirty` | Fallback dirty-state detection |
| `git_get_head_content` | Fetch file content from HEAD for comparisons |
| `git_list_head_folder` | Fetch folder contents from HEAD |
| `git_diff_last` | Return latest commit diff |
| `git_commit_amend` | Rename the latest commit |
| `generate_checkpoint_name` | Ask the configured model to summarise the latest diff |
| `fetch_models` | Query `<base>/models` and return model IDs |
| `test_connection` | Validate endpoint/API key and classify the failure mode |
| `test_model` | Validate a concrete model name |

### Internal backend helper modules

The branch also centralizes repeated backend logic into internal command helper modules:

| Module | Purpose |
|---|---|
| `commands/http.rs` | Builds `<base>/chat/completions` and `<base>/models` URLs, formats bearer auth, and applies common request headers |
| `commands/line_endings.rs` | Normalizes CRLF and lone CR text to LF for file and git-content reads |
| `commands/validation.rs` | Validates paths and bare filenames for character/context operations, including traversal and hidden-name rejection |

Runtime defaults are defined once in `src-tauri/src/types.rs` as `DEFAULT_MODEL`, `DEFAULT_ENDPOINT`, `DEFAULT_TEMPERATURE`, and `DEFAULT_TOP_P`.

---

## 8. Frontend Architecture

### Shared state and DOM

`ui/app.js` exports:

- `state` — shared mutable application state
- `dom` — cached DOM element references
- `TAB_FILE_MAP` and `TRACKED_FOLDERS` re-exported from `tracked-paths.js`

The project intentionally uses simple shared state rather than a UI framework. Important `state` fields include:

- `conversationHistory`
- `tabContents`
- `contextFiles`
- `activeTab`
- `activeContextFile`
- `selectedCharacter`
- `currentWorkFolder`
- `isStreaming`
- `chatDisabled`
- `cmView`

### Frontend module responsibilities

| Module | Responsibility |
|---|---|
| `app.js` | App bootstrap, event wiring, chat/settings gating, shared state/dom |
| `characters.js` | Character dropdown, create modal, load/reload flows, scratchpad mode |
| `editor.js` | CodeMirror sync, autosave, tab switching, token counter, instructions visibility warning |
| `context.js` | Context sidebar rendering, context CRUD, new/delete modals, active-file saving, drag & drop imports |
| `chat.js` | Message assembly, send/stream lifecycle, thinking modal, message actions, per-message previews |
| `helpers.js` | Shared markdown rendering, prompt-building helpers, live editor-state sync, error formatting, character path helpers |
| `preview.js` | Shared preview rendering and preview modal lifecycle |
| `git.js` | Dirty detection, checkpoint save flow, history modal, restore flow |
| `settings.js` | Settings load/save/sync, model fetching, connection/model test flows |
| `divider.js` | Left/right pane resizing |
| `tracked-paths.js` | Mapping of tracked tabs/files and tracked folders/extensions |

---

## 9. Current UI Behaviour

### 9.1 Layout

The app uses a two-pane desktop layout:

- **Left pane**
  - context sidebar
  - tab bar (`Instructions`, `System Prompt`, `Description`, `First Response`, `Context`)
  - CodeMirror editor
  - token counter
  - version control bar (`History`, `Preview`, dirty indicator, `Save checkpoint`)

- **Right pane**
  - dismissible error notification area
  - chat-disabled overlay when key/model/endpoint are missing
  - message list
  - input area with `Resend` and `Send`

### 9.2 Character loading modes

- **No work folder configured**: the selector prompts the user to configure Settings
- **No characters yet**: the selector shows `No characters yet`
- **Scratchpad mode**: when no character is selected, the editor is cleared and no file-backed saving occurs
- **Character selected**: tracked character files and context files load in parallel, then dirty state is recalculated

### 9.3 Editor behaviour

- CodeMirror powers the editor surface
- the active tab auto-saves after a 1-second debounce
- switching tabs flushes unsaved content
- PDF context files are read-only
- token count uses a simple `chars / 4` heuristic

### 9.4 Instructions visibility warning

If `instructions.txt` contains text but `system-prompt.txt` does not contain `%%CHARACTER_INSTRUCTIONS%%`:

- the **Instructions** tab gets a warning icon/tint
- a banner appears while viewing the **System Prompt** tab

This warns the user that the instructions file would otherwise be ignored at send time.

### 9.5 Prompt preview

There are two preview flows:

1. **Global Preview** in the left pane — assembled prompt without conversation history
2. **Per-message preview** — the exact prompt context used up to a given message

Both use the shared rendering logic in `ui/preview.js`.

### 9.6 Context file creation modal

Clicking the context add button opens the in-app **New Context File** modal. The modal accepts a filename, creates the file through `create_context_file`, refreshes the context list, selects the created file, and closes on **Cancel**, close button, or **Escape**. Invalid names keep focus in the modal and surface the backend validation message through the input placeholder/border.

### 9.7 Chat controls

- **Send**: appends the user message and starts a streaming assistant response
- **Resend**: truncates history at the last user turn and regenerates from there
- **Delete**: removes the selected message and everything after it
- **Edit**: edits a message inline and updates the conversation history from that point

### 9.8 Thinking/reasoning modal

When the backend receives streaming reasoning deltas (`reasoning_content` or `reasoning`), it emits `stream-thinking`. The frontend stores the content on the assistant turn as internal `_thinking` metadata and shows a 🧠 button next to the assistant label. Clicking the button opens the **Thinking Process** modal, which renders the reasoning with the same sanitized markdown pipeline used for chat messages.

---

## 10. Prompt Assembly & Data Flow

### Prompt assembly order

When the frontend builds the messages array, it uses this order:

1. **System message**
   - starts from `system-prompt.txt`
   - replaces `%%CHARACTER_INSTRUCTIONS%%` with `instructions.txt`
   - included if either file has content

2. **Context file messages**
   - each non-empty context file becomes a separate **user** message
   - each gets an explanatory prefix
   - each includes `isFile: true`

3. **Conversation history**
   - user/assistant chat turns only

### First response injection

`intro.txt` content is synced to a first-response assistant bubble on character load and on intro edits. The bubble is injected only when the chat is empty or contains exactly one existing first-response message; it is removed when `intro.txt` is cleared. The internal `_isFirstResponse` marker is stripped from API payloads so the message serializes as a normal assistant turn. A subtle "✦ First Response" label distinguishes it visually.

### Chat request flow

```text
Frontend
  └─ invoke("send_message_stream", { messages, maxTokens? })
        ↓
Rust backend
  └─ POST <base>/chat/completions
        ↓
Provider returns SSE stream
        ↓
Rust emits:
  - stream-thinking  (optional reasoning/thinking deltas)
  - stream-token
  - stream-end
        ↓
Frontend appends rendered markdown progressively
```

---

## 11. Git Checkpointing Model

Each character directory is its own local git repository.

### What git is used for

- saving checkpoints
- listing checkpoint history
- restoring previous versions
- comparing the current editor state to HEAD for dirty detection

### Dirty-state logic

The app primarily compares editor/context state against the committed HEAD contents via:

- `git_get_head_content`
- `git_list_head_folder`

It falls back to `git_is_dirty` if HEAD-based comparison is unavailable.

### AI checkpoint names

After a timestamp-based checkpoint commit is created, the app can:

1. fetch the latest diff
2. ask the configured LLM for a short checkpoint title
3. amend the latest commit message in the background

If that rename fails, the timestamp-based name remains valid.

---

## 12. File Handling Rules

### Validation and safety

The backend centralizes path and filename checks in `commands/validation.rs`. It rejects:

- path traversal via `..`
- blocked `.` path components in validated paths
- hidden character and context filenames that start with `.`
- unsupported context file extensions

### Supported context files

- `.txt`
- `.md`
- `.pdf`

Behaviour:

- filenames without a supported extension default to `.txt`
- copy collisions are resolved with suffixes such as `-1`
- PDFs are extracted to text and marked `isReadOnly: true`

---

## 13. Testing & Quality Gates

### Rust tests

Rust integration tests cover:

- character creation and ensure flow
- git commit/log/revert/amend/head lookups
- context file creation/deletion/copying
- line ending normalization and path edge cases

### Frontend tests

Vitest covers:

- prompt assembly and stream handling
- character selection/loading
- editor save/switch behaviour
- instructions visibility warning logic
- dirty-state and history rendering
- context file selection/create/delete flows
- settings load/save/model testing logic

### CI

The CI workflow currently runs:

- `cargo check`
- `cargo clippy -- -D warnings`
- `cargo test`
- `npm test`

---

## 14. Roadmap Snapshot

| Area | Status |
|---|---|
| Two-pane editor/chat layout | ✅ Done |
| Character file load/save | ✅ Done |
| Per-character git checkpoints | ✅ Done |
| Markdown chat + edit/delete/resend | ✅ Done |
| Context folder with PDF support | ✅ Done |
| Prompt preview | ✅ Done |
| Model discovery/testing in Settings | ✅ Done |
| First response injection from `intro.txt` | ✅ Done |
| Thinking/reasoning stream display | ✅ Done |
| Venice.ai preset/polish pass | ✅ Done |

---

## 15. Notes for Future Contributors

- Treat the configured endpoint as a **base URL**, not a full chat-completions path.
- If you change tracked character file names, update:
  - `ui/tracked-paths.js`
  - the docs in `README.md`, `TODO.md`, `AGENTS.md`, and this file
- If you change character load logic, keep `handleCharacterSelect()` and `reloadAfterRevert()` in sync.
- If you add new prompt-visible inputs, update both the send path and the preview path.
- Reuse `ui/helpers.js` for shared prompt assembly, markdown rendering, state sync, and path helpers before adding new duplicated frontend helpers.
- Reuse backend helpers in `commands/http.rs`, `commands/line_endings.rs`, and `commands/validation.rs` before adding command-local URL, text-normalization, or path-safety logic.
