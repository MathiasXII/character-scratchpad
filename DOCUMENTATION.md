# LLM Chat — Venice.ai Character Workbench

## 1. Project Overview

**LLM Chat** is a desktop application built to develop, test, and refine AI characters compatible with [Venice.ai](https://venice.ai). It provides a local workbench where character creators can write prompts, iterate on personalities, and validate behaviour through live conversation — all within a single interface.

### Goal

Create an environment to develop and test characters that are compatible with Venice.ai, combining an ordinary LLM chat with live prompt editing, file-based versioning, and standardized character file organisation.

---

## 2. Architecture

| Layer | Technology | Role |
|-------|-----------|------|
| Native shell | **Tauri v1** (Rust) | Desktop window, filesystem access, git operations, HTTP client |
| Backend | **Rust** (`src-tauri/src/main.rs`) | API proxy with streaming, app state management, Tauri commands |
| Frontend | **Vanilla HTML/CSS/JS** (`ui/`) | UI rendering, user interaction, markdown display |

### Why Tauri?

Tauri provides a lightweight native shell with direct Rust access to the filesystem and system APIs. This is essential for:

- Managing character folder structures on disk
- Running local git operations (init, commit, revert) without external dependencies
- Streaming API responses through the backend while keeping the frontend responsive
- Keeping the application self-contained — no Node server required at runtime

---

## 3. Current State (v0.1.0)

The application currently functions as a basic LLM chat client:

- **Streaming chat** — Messages are sent to an OpenAI-compatible API endpoint and tokens stream back in real time via Tauri events.
- **Settings** — API key, model name, and endpoint URL are persisted in `localStorage` and synced to the Rust backend on startup/save.
- **Dark theme UI** — Single-pane chat interface with message bubbles, auto-scrolling, and a settings modal.

### Source Layout

```
llm-chat/
├── package.json                # Node dev scripts (tauri dev/build)
├── src-tauri/
│   ├── Cargo.toml              # Rust dependencies
│   ├── tauri.conf.json         # Tauri window & bundle config
│   └── src/
│       └── main.rs             # All backend logic (~143 lines)
└── ui/
    ├── index.html              # Single-page markup
    ├── styles.css              # Dark theme styles
    └── app.js                  # Frontend logic (~196 lines)
```

### Key Dependencies (Rust)

| Crate | Purpose |
|-------|---------|
| `tauri` 1.x | Desktop framework, IPC, event system |
| `reqwest` 0.11 | HTTP client with streaming support |
| `serde` / `serde_json` | Serialization for API payloads |
| `futures-util` 0.3 | Stream processing for SSE parsing |
| `tokio` 1.x | Async runtime |

---

## 4. Target Features

### 4.1 LLM Chat

A fully functional chat that works out of the box — no character configuration required.

| Feature | Description |
|---------|-------------|
| Markdown rendering | Messages support full markdown (bold, italic, code blocks, lists, links) |
| Send message | Standard send — appends user message, streams assistant reply |
| Resend last message | Replaces the last user message with new text instead of appending; the previous user message is deleted and the new one takes its place, then a new response is generated |
| Delete message | Removes a message and **all messages below it** in the conversation |
| Edit any message | Clicking edit on any message (user or assistant) replaces its display with an edit input box (plain text, no markdown rendering). Saving re-submits the conversation from that point forward |

**Edit behaviour detail:** When a message is edited, the conversation is truncated at that point and regenerated — identical to how OpenAI's "Edit" works in ChatGPT.

### 4.2 Live Prompt Editing

Changes to character files are reflected immediately in the chat — no reload or restart required.

- Editing `instructions.md`, `prompt.md`, or context files triggers a live re-injection of the system prompt into the conversation on the next message send.
- The chat uses the latest on-disk content at the time of each API call.

### 4.3 Character File Versioning

Each character folder is backed by a local git repository.

| Operation | Description |
|-----------|-------------|
| Commit | User explicitly commits the current state of all character files with a message |
| Revert | User reverts to a previous commit, restoring all character files to that state |
| Auto-save | All edits to character files are silently auto-saved to disk in the background. If auto-save fails, the application **must raise an error** to the user |

**Scope:** Only commit and revert. No branching, merging, remotes, or push/pull. The git repository exists solely as an undo history.

### 4.4 Work Folder & Character Organisation

```
<work-folder>/
└── <character-name>/
    ├── .git/                    # Local repository (commit/revert only)
    ├── instructions.md          # Character personality, traits, behaviour rules
    ├── prompt.md               # System prompt sent to the LLM
    ├── description.md          # Public-facing character description (shown on Venice.ai)
    ├── first-response.md       # The first message the character implicitly "said"
    └── context/                # Optional context files
        ├── lore.md
        └── ...
```

| File | Purpose |
|------|---------|
| `instructions.md` | Defines the character's personality, speech patterns, traits, and behavioural constraints. This is the "who the character is" file. |
| `prompt.md` | The system prompt injected into the LLM API call. Defines the role and instructions the model follows. |
| `description.md` | A user-facing description of the character. Visible from the character list on Venice.ai. Must be enticing and self-contained. |
| `first-response.md` | The opening line of the character. Implicitly included as if the LLM already produced this as its first message. |
| `context/*.md` or `context/*.txt` | Supplementary context files the user can create and edit within the application. These are included in the prompt payload. |

**Rules:**

- The work folder location is configurable.
- Each character gets its own subfolder.
- All character files are plain text (`.md` or `.txt`), editable both inside the app and externally.
- Context files are user-created; the app provides an editor for them.

---

## 5. UI Layout (Desktop)

The application uses a **two-pane horizontal layout** optimized for desktop use.

```
┌──────────────────────────────────────────────────────────────┐
│  Header: App title + Character selector + Settings           │
├──────────────────────────┬───────────────────────────────────┤
│ [Instructions][Prompt].. │                                   │
│ [Description][1st Resp]  │   Right Pane (Chat)               │
│──────────────────────────│                                   │
│                          │   ┌───────────────────────────┐   │
│                          │   │  Message bubbles           │   │
│  Markdown textarea       │   │  with markdown rendering   │   │
│  (fills entire space)     │   │                           │   │
│                          │   │                           │   │
│                          │   └───────────────────────────┘   │
│                          │   ┌───────────────────────────┐   │
│                          │   │  Input area                │   │
│                          │   └───────────────────────────┘   │
│                          │                                   │
│  ~234 tokens             │                                   │
├──────────────────────────┴───────────────────────────────────┤
│  Footer: Version info / Status                                │
└──────────────────────────────────────────────────────────────┘
```

### Left Pane — Character Editor

The left pane is minimalist by design: **horizontal tabs across the top, a single markdown textarea filling all remaining space, and a token counter at the bottom.** No extra chrome. Maximum editing area.

| Tab | Maps to | Description |
|-----|---------|-------------|
| **Instructions** | `instructions.md` | Define personality, traits, speech patterns, behavioural rules |
| **System Prompt** | `prompt.md` | Define the AI's role and system-level instructions |
| **Description** | `description.md` | Public-facing character description for Venice.ai listings |
| **First Response** | `first-response.md` | The opening line the character implicitly produces |

**Left pane structure (top to bottom):**

1. **Tab bar** — Horizontal row of tabs aligned at the top. Clicking a tab switches the textarea content.
2. **Markdown textarea** — A single `<textarea>` that fills 100% of the space between the tab bar and the token counter. Supports markdown syntax. Edits are auto-saved to disk.
3. **Token counter** — A small, subtle count of approximate tokens in the current file content, displayed at the bottom of the pane. Calculated using a rough heuristic (e.g., ~4 characters per token) since exact counts require the model's tokenizer.

### Right Pane — Chat

- Displays the conversation with **full markdown rendering** (bold, italic, code blocks, lists, links, etc.).
- Supports send, resend, delete, and edit operations on messages.
- Uses the current character files as the system prompt context.

---

## 6. API Integration

### Current Flow

```
Frontend (app.js)
  │  invoke("send_message_stream", { messages })
  ▼
Rust Backend (main.rs)
  │  POST <endpoint>/chat/completions
  │  Authorization: Bearer <api_key>
  │  Body: { model, messages, stream: true }
  ▼
API (OpenAI-compatible)
  │  SSE stream: data: { choices: [{ delta: { content } }] }
  ▼
Rust Backend
  │  emit("stream-token", content)  → per token
  │  emit("stream-end")             → on completion
  ▼
Frontend
  │  Appends tokens to the assistant message bubble
  │  Marks streaming complete on "stream-end"
```

### Settings

| Setting | Default | Stored In |
|---------|---------|-----------|
| API Key | *(empty)* | `localStorage` → Rust `AppState` |
| Model | `gpt-4o-mini` | `localStorage` → Rust `AppState` |
| Endpoint | `https://api.openai.com/v1/chat/completions` | `localStorage` → Rust `AppState` |

The endpoint is configurable to support Venice.ai's API or any OpenAI-compatible provider.

---

## 7. Planned Tauri Commands (Target)

| Command | Purpose |
|---------|---------|
| `send_message_stream` | Stream chat completions (already implemented) |
| `update_settings` | Persist API settings to backend state (already implemented) |
| `get_settings` | Read current settings from backend state (already implemented) |
| `load_character_file` | Read a character file (`instructions.md`, `prompt.md`, etc.) from disk |
| `save_character_file` | Write content to a character file (triggers auto-save) |
| `list_characters` | Scan the work folder and return all character subfolders |
| `create_character` | Create a new character folder with default files and init git |
| `git_commit` | Stage all changes and commit with a user-provided message |
| `git_revert` | Revert character files to a specified commit |
| `git_log` | Return the commit history for the current character |
| `list_context_files` | Return all `.md`/`.txt` files in a character's `context/` folder |
| `create_context_file` | Create a new context file in the `context/` folder |

---

## 8. Data Flow — Character-Aware Chat (Target)

```
1. User selects a character
2. App loads: instructions.md + prompt.md + context/* + first-response.md
3. App constructs system message from prompt.md + instructions.md + context/*
4. On message send:
   a. Build messages array: [system, ...history, user]
   b. If first-response.md has content and no messages yet,
      prepend assistant message from first-response.md
   c. Call API with streaming
5. On character file edit (in left pane):
   a. Auto-save to disk
   b. Next message send picks up updated file content automatically
```

---

## 9. Development

### Prerequisites

- **Rust** (stable toolchain)
- **Node.js** (for `@tauri-apps/cli`)
- **Tauri CLI** v1 (`npm install` handles this)

### Running

```bash
cd llm-chat
npm install
npm run dev
```

### Building

```bash
npm run build
```

### Project Configuration

- **Tauri config**: `src-tauri/tauri.conf.json` — window size, CSP, bundle identifier, icon paths
- **Rust dependencies**: `src-tauri/Cargo.toml`
- **Node scripts**: `package.json` — `dev` and `build` commands

---

## 10. Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| **v0.1** | Basic LLM chat with streaming | ✅ Done |
| **v0.2** | Two-pane UI, character file editor tabs | 🔲 Planned |
| **v0.3** | Filesystem commands, auto-save, character CRUD | 🔲 Planned |
| **v0.4** | Git-backed versioning (commit/revert) | 🔲 Planned |
| **v0.5** | Markdown rendering in chat, message edit/delete/resend | 🔲 Planned |
| **v0.6** | Context folder management, first-response injection | 🔲 Planned |
| **v1.0** | Venice.ai API compatibility, polish, testing | 🔲 Planned |
