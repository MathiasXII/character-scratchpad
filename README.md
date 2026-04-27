# Character Scratch Pad — Venice.ai Character Workbench

A desktop application for developing and testing AI characters against OpenAI-compatible chat APIs. It is designed around Venice.ai-style character workflows, while remaining usable with other compatible providers and local model gateways.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![Tauri](https://img.shields.io/badge/Tauri-v2-orange)
![Rust](https://img.shields.io/badge/Rust-stable-brown)

> **Transparency notice:** The majority of this codebase was generated through AI-assisted development (vibe coding). The architecture, feature design, and direction are human-authored; the implementation was largely produced with AI pair programming tools.

---

## What It Does

- **Two-pane layout** — left pane edits character files, right pane is a live chat interface
- **Streaming chat** — streams responses from any OpenAI-compatible API
- **Character file editor** — tabs for `Instructions`, `System Prompt`, `Description`, `First Response`, and `Context`
- **Prompt previews** — inspect the assembled prompt globally or per message
- **Git-backed versioning** — each character folder is a local git repo; save checkpoints and restore any version
- **Context files** — attach supplementary `.md` / `.txt` / `.pdf` files; drag & drop to add files
- **Auto-save** — edits are silently persisted to disk and save errors are surfaced immediately
- **Provider tooling** — fetch models, test endpoint/API key, test a model, and tune `temperature` / `top_p`
- **First-response injection** — `intro.txt` content appears as an assistant bubble on character load, with a subtle "✦ First Response" label
- **Thinking/reasoning display** — providers that stream `reasoning_content` or `reasoning` expose it behind a brain icon on assistant messages

---

## Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | [Tauri v2](https://v2.tauri.app) (Rust) |
| Backend | Rust — filesystem, git, HTTP streaming, settings persistence |
| Frontend | Vanilla HTML / CSS / JS |
| Editor | CodeMirror 6 bundled into `ui/lib/editor-cm.bundle.js` |

No Electron. No Node server at runtime. Lightweight native window with a Rust core.

---

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- [Node.js](https://nodejs.org) (used for Tauri CLI, Vitest, and the editor bundling step)
- Platform dependencies for Tauri v2:
  - **Windows**: Microsoft Visual C++ Build Tools or Visual Studio, plus WebView2
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `libwebkit2gtk-4.1-dev`, `libssl-dev`, `libgtk-3-dev` — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

---

## Getting Started

```bash
# Clone the repo
git clone https://github.com/MathiasXII/eight-day.git
cd eight-day

# Install development dependencies
npm install

# Start the app in development mode
npm run dev
```

The first run will compile the Rust backend, so expect a slower startup on a cold cache.

---

## Configuration

On first launch, open **Settings** and configure:

| Setting | Description | Default in frontend UI |
|---------|-------------|------------------------|
| API Key | Your API key for the LLM provider | *(empty)* |
| Model | Model identifier (example: `zai-org-glm-4.6`) | `zai-org-glm-4.6` |
| Endpoint | OpenAI-compatible **base URL** | `https://api.venice.ai/api/v1` |
| Temperature | Sampling temperature | `0.7` |
| Top P | Nucleus sampling value | `1.0` |
| Work Folder | Directory where character folders are stored | chosen by the user |

### Important endpoint note

The app stores a **base URL**, not the full chat-completions endpoint.

- ✅ Correct: `https://api.openai.com/v1`
- ✅ Correct: `https://api.venice.ai/api/v1`
- ❌ Do not enter: `.../chat/completions`

The Rust backend appends `/chat/completions` for chat requests and `/models` for model discovery.

### Venice.ai

For Venice.ai, use the base URL:

```text
https://api.venice.ai/api/v1
```

and your Venice API key.

### Persistence

- API key, model, endpoint, temperature, and top-p are synced to backend `settings.json`
- the work folder is stored in `localStorage`

---

## Character File Layout

Each character is stored as a folder inside the work folder:

```text
<work-folder>/
└── my-character/
    ├── .git/                # Local git repo (checkpoint history only)
    ├── instructions.txt     # Personality, speech patterns, behavioural rules
    ├── system-prompt.txt    # System prompt template sent to the LLM API
    ├── description.txt      # Public-facing description text
    ├── intro.txt            # First-response message injected into chat on character load
    └── context/             # Optional supplementary context files
        ├── lore.md
        ├── reference.pdf    # PDFs are read-only; text is extracted for display
        └── ...
```

### Character Studio compatibility

This project uses the same core file names as [Character Studio](https://characterbrowser.app/studio) by [Ominous](https://ko-fi.com/omnius42) — a browser-based Venice.ai character editor. Projects created in either tool can be opened in the other:

- **This app → Character Studio**: point Character Studio's *Open Project* at your character folder via the Local Folder (FSA) option.
- **Character Studio → this app**: set your work folder to the directory containing the Character Studio project folder.

Both tools read and write the same files (`instructions.txt`, `system-prompt.txt`, `description.txt`, `intro.txt`, `context/`), so they stay in sync automatically.

### System prompt injection

At send time:

- `%%CHARACTER_INSTRUCTIONS%%` in `system-prompt.txt` is replaced with `instructions.txt`
- non-empty context files are each injected as separate user messages before conversation history
- `intro.txt` content is synced to a first-response assistant bubble on character load and on intro edits; the bubble is removed when intro is cleared, and the internal `_isFirstResponse` marker is stripped from API payloads

---

## Main Features

### Character editing

- CodeMirror 6 editor
- tabbed editing for tracked files
- autosave with save-error banner
- token counter heuristic
- warning when `instructions.txt` would be ignored because the prompt is missing `%%CHARACTER_INSTRUCTIONS%%`

### Chat workflow

- markdown rendering for both user and assistant messages
- streaming token updates
- first-response injection from `intro.txt` with guarded sync and subtle label
- optional thinking/reasoning modal when a provider streams reasoning deltas
- delete message + following history
- edit message in place
- resend from the last user turn
- dismissible error notification bar

### Context workflow

- context tab appears only when a character is selected
- custom **New Context File** modal for creating `.txt` / `.md` files without relying on browser prompts
- drag & drop imports for `.txt`, `.md`, and `.pdf` files
- read-only PDF context display after backend text extraction

### Prompt inspection

- global Preview button for the assembled prompt
- per-message preview button to inspect the exact prompt context for a turn

### Checkpoints

- per-character git repositories
- dirty-state detection against HEAD
- save checkpoint button
- history modal with restore flow
- optional LLM-generated checkpoint rename after commit

---

## Development Commands

```bash
# Start the desktop app in dev mode
npm run dev

# Rebuild the CodeMirror bundle only
npm run bundle

# Run frontend tests
npm test

# Run Rust tests
cd src-tauri && cargo test

# Build desktop bundles
npm run build
```

---

## Project Structure

```text
llm-chat/
├── package.json              # npm scripts: dev, build, bundle, test, clean
├── src-tauri/
│   ├── Cargo.toml            # Rust dependencies
│   ├── tauri.conf.json       # Window config, CSP, bundle identifier
│   └── src/
│       ├── main.rs           # Windows subsystem stub
│       ├── lib.rs            # Tauri builder, AppState init, command registration
│       ├── state.rs          # AppState (api_key, model, endpoint, temperature, top_p)
│       ├── types.rs          # Shared types: ChatMessage, Settings, ContextFile, etc.
│       └── commands/
│           ├── http.rs           # Shared URL/auth request helpers for OpenAI-compatible calls
│           ├── line_endings.rs   # Shared CRLF/CR → LF normalization helper
│           ├── validation.rs     # Shared path and filename safety validation
│           ├── stream_chat.rs    # Streaming chat completions (SSE → Tauri events)
│           ├── settings.rs       # update_settings / get_settings
│           ├── files.rs          # load_file, save_file, context file management
│           ├── characters.rs     # list_characters, create_character, ensure_character_files
│           ├── git.rs            # checkpoints, history, restore, dirty helpers
│           ├── models.rs         # fetch_models
│           └── test_connection.rs# test_connection / test_model
└── ui/
    ├── index.html            # SPA markup and modals
    ├── styles.css            # Dark theme styling
    ├── app.js                # Orchestrator: shared state/DOM, bootstrap, event wiring, first-response sync
    ├── chat.js               # Send, stream listeners, message actions, prompt builders, first-response sync
    ├── editor.js             # Tab switching, auto-save, token counter, warnings
    ├── characters.js         # Character list, select, create, reload-after-revert, first-response sync
    ├── context.js            # Context sidebar and drag & drop imports
    ├── helpers.js            # Shared markdown, prompt-building, state-sync, and path helpers
    ├── settings.js           # Settings modal load/save/sync + model tooling
    ├── git.js                # Checkpoint bar, history modal, dirty checks
    ├── preview.js            # Prompt preview modal rendering
    ├── divider.js            # Pane divider drag logic
    └── tracked-paths.js      # Tracked file/folder config
```

---

## Testing & CI

- **Frontend**: Vitest (`ui/**/*.test.js`) in `jsdom`
- **Backend**: Rust integration tests in `src-tauri/tests/`
- **CI** runs:
  - `cargo check`
  - `cargo clippy -- -D warnings`
  - `cargo test`
  - `npm test`

Node.js in CI is currently pinned to **24**.

---

## Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| v0.1 | Basic LLM chat with streaming | ✅ Done |
| v0.2 | Two-pane UI, character file editor | ✅ Done |
| v0.3 | Filesystem commands, auto-save, character CRUD | ✅ Done |
| v0.4 | Git-backed versioning (commit / revert / AI checkpoint naming) | ✅ Done |
| v0.5 | Markdown rendering in chat, message edit / delete / resend | ✅ Done |
| v0.6 | Context folder management + first-response injection | ✅ Done |
| v1.0 | Venice.ai API compatibility & polish | ✅ Done |
