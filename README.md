# Character Scratch Pad — Venice.ai Character Workbench

A desktop application for developing and testing AI characters compatible with [Venice.ai](https://venice.ai). Write prompts, iterate on personalities, and validate behaviour through live conversation — all in one place.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![Tauri](https://img.shields.io/badge/Tauri-v2-orange)
![Rust](https://img.shields.io/badge/Rust-stable-brown)

> **Transparency notice:** The majority of this codebase was generated through AI-assisted development (vibe coding). The architecture, feature design, and direction are human-authored; the implementation was largely produced with AI pair programming tools.

---

## What It Does

- **Two-pane layout** — left pane edits character files, right pane is a live chat interface
- **Streaming chat** — streams responses from any OpenAI-compatible API (Venice.ai, OpenAI, local models)
- **Character file editor** — tabs for `Instructions`, `System Prompt`, `Description`, and `First Response`
- **Git-backed versioning** — each character folder is a local git repo; save checkpoints and restore any version
- **Context files** — attach supplementary `.md`/`.txt`/`.pdf` files that get injected into the prompt payload; drag & drop to add files
- **Auto-save** — edits are silently persisted to disk; errors are surfaced immediately

---

## Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | [Tauri v2](https://v2.tauri.app) (Rust) |
| Backend | Rust — filesystem, git, HTTP streaming |
| Frontend | Vanilla HTML / CSS / JS (no framework, no bundler at runtime) |

No Electron. No Node server at runtime. Lightweight native window with a Rust core.

---

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- [Node.js](https://nodejs.org) (LTS recommended, used only for the Tauri CLI and Rollup bundling)
- Platform dependencies for Tauri v2:
  - **Windows**: Microsoft Visual C++ Build Tools or Visual Studio
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `libwebkit2gtk-4.1-dev`, `libssl-dev`, `libgtk-3-dev` — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

---

## Getting Started

```bash
# Clone the repo
git clone https://github.com/MathiasXII/eight-day.git
cd eight-day

# Install JS dev dependencies (Tauri CLI + CodeMirror + Rollup)
npm install

# Start the app in development mode
npm run dev
```

The first run will compile the Rust backend — expect 2–5 minutes on a cold cache.

---

## Configuration

On first launch, open **Settings** (gear icon in the header) and set:

| Setting | Description | Default |
|---------|-------------|---------|
| API Key | Your API key for the LLM provider | *(empty)* |
| Model | Model identifier (e.g. `gpt-4o-mini`) | `gpt-4o-mini` |
| Endpoint | OpenAI-compatible chat completions URL | `https://api.openai.com/v1/chat/completions` |
| Work Folder | Directory where character folders are stored | `characters/` next to the executable |

For Venice.ai, set the endpoint to `https://api.venice.ai/api/v3/chat/completions` and use your Venice API key.

Settings are persisted in `localStorage` and synced to the Rust backend on startup.

---

## Character File Layout

Each character is a folder inside your work folder:

```
<work-folder>/
└── my-character/
    ├── .git/                # Local git repo (commit/revert only — no remote)
    ├── instructions.txt     # Personality, speech patterns, behavioural rules
    ├── system-prompt.txt    # System prompt sent to the LLM API
    ├── description.txt      # Public-facing description (for Venice.ai listings)
    ├── intro.txt            # Opening line the character implicitly "already said"
    └── context/             # Optional supplementary context files (.md, .txt, .pdf)
        ├── lore.md
        ├── reference.pdf     # PDFs are read-only; text is extracted for display
        └── ...
```

### Compatibility with Character Studio

The character folder format is fully compatible with [Character Studio](https://characterbrowser.app/studio) by [Ominous](https://ko-fi.com/omnius42) — a browser-based Venice.ai character editor. Projects created in either tool can be opened in the other:

- **This app → Character Studio**: point Character Studio's *Open Project* at your character folder via the Local Folder (FSA) option.
- **Character Studio → this app**: set your work folder to the directory containing the Character Studio project folder.

Both tools read and write the same files (`instructions.txt`, `system-prompt.txt`, `description.txt`, `intro.txt`, `context/`), so they stay in sync automatically.

### System Prompt Injection

The `%%CHARACTER_INSTRUCTIONS%%` placeholder in `system-prompt.txt` is replaced with the content of `instructions.txt` at send time. Context files are each injected as separate user messages before the conversation history.

---

## Building

```bash
npm run build
```

Produces platform-specific installers in `src-tauri/target/release/bundle/`.

---

## Project Structure

```
llm-chat/
├── package.json              # npm scripts: dev, build, bundle
├── src-tauri/
│   ├── Cargo.toml            # Rust dependencies
│   ├── tauri.conf.json       # Window config, CSP, bundle identifier
│   └── src/
│       ├── main.rs           # Tauri builder, AppState init, command registration
│       ├── state.rs          # AppState (api_key, model, endpoint)
│       ├── types.rs          # Shared types: ChatMessage, Settings, ContextFile (with isReadOnly), etc.
│       └── commands/
│           ├── stream_chat.rs   # Streaming chat completions (SSE → Tauri events)
│           ├── settings.rs      # update_settings / get_settings
│           ├── files.rs         # load_file, save_file, list_context_files, create_context_file, delete_context_file, copy_file_to_context
│           ├── characters.rs    # list_characters, create_character
│           └── git.rs           # git_commit, git_log, git_revert, checkpoints
└── ui/
    ├── index.html            # SPA markup
    ├── styles.css            # Dark theme (CSS variables)
    ├── app.js                # Orchestrator: shared state/DOM, init, event wiring
    ├── chat.js               # Send, stream listeners, message DOM
    ├── editor.js             # Tab switching, auto-save, token counter, read-only mode
    ├── characters.js         # Character list, select, create
    ├── context.js            # Context file sidebar: list, select, add, delete, drag & drop, PDF badge
    ├── settings.js           # Settings modal load/save/sync
    ├── git.js                # Checkpoint bar, history modal
    └── divider.js            # Pane divider drag logic
```

---

## Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| v0.1 | Basic LLM chat with streaming | ✅ Done |
| v0.2 | Two-pane UI, character file editor | ✅ Done |
| v0.3 | Filesystem commands, auto-save, character CRUD | ✅ Done |
| v0.4 | Git-backed versioning (commit / revert / AI checkpoint naming) | ✅ Done |
| v0.5 | Markdown rendering in chat, message edit / delete / resend | ✅ Done |
| v0.6 | Context folder management, first-response injection | 🔲 In progress |
| v1.0 | Venice.ai API compatibility & polish | 🔲 Planned |
