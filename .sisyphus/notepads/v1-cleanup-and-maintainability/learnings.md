# Learnings — v1-cleanup-and-maintainability

## 2026-04-26 Session Start
- Plan: Pre-v1 Cleanup and Maintainability Pass
- 15 implementation tasks (T1-T15) across 3 waves + 4 final verification tasks (F1-F4)
- Wave 1: T1-T6 (all quick, parallel)
- Wave 2: T7-T12 (after Wave 1, dependencies on T1-T6)
- Wave 3: T13-T15 (after Wave 2)
- Final: F1-F4 (after all implementation)
- Critical path: T1 → T7 → T10 → T14 → F1-F4
- Stack: Rust/Tauri v2 backend, vanilla JS frontend, CodeMirror 6 editor
- Test commands: `npm test`, `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`

## 2026-04-26 Helper Seam Extraction
- Shared seams now live in `ui/helpers.js` and are imported by the existing feature modules.
- Kept behavior stable by only extracting repeated helpers: markdown rendering config, error coercion, and character-directory path building.
- `ui/app.js` remains the shared state/DOM hub; the new helper module is intentionally narrow so later cleanup tasks can route through it without reshaping the frontend module graph.
- Extracted a shared `normalize_line_endings()` helper into `src-tauri/src/commands/line_endings.rs` and routed file + git content readers through it without changing CRLF/CR → LF behavior.
- Rust tests and Vitest both passed after the refactor; existing line-ending coverage still verifies normalized save/load and context listing behavior.
- Connection/model helper truncation should use UTF-8-safe character iteration (`.chars().take(max).collect::<String>()`) instead of byte slicing so multi-byte bodies cannot panic.
- A small regression test pair is enough here: keep ASCII truncation stable and verify multi-byte input truncates without panicking.

## 2026-04-26 T1 defaults canonicalization
- Centralized backend defaults in `src-tauri/src/types.rs` as `DEFAULT_MODEL`, `DEFAULT_ENDPOINT`, `DEFAULT_TEMPERATURE`, and `DEFAULT_TOP_P`.
- Updated runtime initialization in `src-tauri/src/lib.rs` and settings-file fallback in `src-tauri/src/commands/settings.rs` to use the same constants.
- Updated README defaults to match the canonical Venice baseline: endpoint `https://api.venice.ai/api/v1`, model `zai-org-glm-4.6`, temperature `0.7`, top_p `1.0`.
- T4 cleanup: repeated git repository opening and signature creation were centralized into private helpers in `src-tauri/src/commands/git.rs`
- `characters.rs` now reuses the git helpers for initial repo setup, keeping commit behavior stable while removing duplicate boilerplate

## 2026-04-26 T5 temp workspace consolidation
- Shared `TempTestDir` in `src-tauri/tests/common.rs` already covered per-test isolation via unique temp-dir naming and `Drop` cleanup.
- Consolidation path was to import `mod common;` in `character_workflow.rs`, `context_files.rs`, and `git_workflow.rs`, then replace local `TempWorkspace` scaffolding with `common::TempTestDir`.
- `files_edge_cases.rs` already used the shared helper, so no behavior change was needed there.

## 2026-04-26 T12 settings helper dedupe
- Settings load/apply logic in `ui/settings.js` now flows through shared snapshot setters instead of duplicating field writes for file vs. storage sources.
- Connection/model tests now share the same button-state and field-error helpers, which keeps unsaved form values testable while reducing repeated success/error handling branches.
- The refactor preserved the existing validation semantics: missing fields still mark their inputs, successful tests still restore the green check state, and the backend invocations still read directly from the form.

## 2026-04-26 T9 backend visibility tightening
- Backend helper visibility can be tightened safely in small steps: `normalize_line_endings()` works as a crate-only helper, `AppState` fields only need crate access, and `ChatCompletionRequest` is only constructed inside the backend.
- Keep Tauri command entrypoints public, but helper return/inner types should stay scoped to the crate when they are only consumed by sibling modules.
- Reuse checks showed the main backend helpers are still exercised across modules (`files.rs`, `git.rs`, `settings.rs`, `stream_chat.rs`), so the safe cleanup target is visibility reduction rather than deletion.

## 2026-04-26 T10 prompt-building and editor-sync consolidation
- Three functions in `chat.js` (`buildMessagesArray`, `buildPromptOnly`, `buildMessagesArrayUpTo`) each contained identical blocks for: (1) editor-to-state sync, (2) system prompt assembly with `%%CHARACTER_INSTRUCTIONS%%` replacement, (3) context file message construction with `CONTEXT_INTRO` prefix.
- Extracted four shared helpers into `ui/helpers.js`: `syncEditorToState(state)`, `buildSystemPrompt(state)`, `CONTEXT_INTRO` constant, `buildContextMessages(state)`.
- `buildSystemPrompt` returns `null` when both system-prompt and instructions are empty, letting callers use a simple `!== null` check instead of duplicating the trim-or-check logic.
- `buildContextMessages` returns an array, so callers use `messages.push(...buildContextMessages(state))` for clean spreading.
- All 70 Vitest tests pass unchanged — the refactoring preserves exact message ordering and content.
- The `editor.js` visibility warning also checks `%%CHARACTER_INSTRUCTIONS%%` but only for display purposes (not prompt building), so it was left untouched.

## 2026-04-26 T11 character/context flow consolidation
- Extracted `loadCharacterFiles(charDir)` and `refreshCharacterUI()` in `characters.js` to eliminate duplicated file-loading and UI-refresh sequences between `handleCharacterSelect` and `reloadAfterRevert`.
- `loadCharacterFiles` returns `{ tabContents, lastSavedContent, contextFiles }` without modifying state — callers assign results themselves, preserving the different post-load logic (e.g., `reloadAfterRevert` preserves `activeContextFile` if it still exists).
- Extracted `saveActiveContextFile()` in `context.js` to consolidate the repeated context-file save pattern across `selectContextFile`, `switchTab`, and `saveCurrentTab`. Returns `true` if saved, `false` if skipped, throws on error — callers handle UI feedback (banner vs console error).
- Extracted `refreshContextFiles(charDir)` in `context.js` to centralize the `invoke("list_context_files")` + state update pattern used in `handleAddContextFile`, `performDelete`, `handleDroppedFiles`, and `loadCharacterFiles`.
- `handleDroppedFiles` now uses `getCharacterDir()` instead of manual string concatenation — minor consistency fix.
- Vitest auto-reformats `vi.fn()` declarations into `vi.hoisted()` when they're referenced in `vi.mock` factories — use `vi.hoisted()` for any mock that appears in a factory callback.
- Circular dependency between `context.js` ↔ `editor.js` already existed (`renderContextFileList` and `getEditorValue`/`setEditorValue`); adding `saveActiveContextFile` to the same cycle is safe since ES modules handle circular imports for function references.
## 2026-04-26 T8 validation helper consolidation
- Extracted alidate_path and alidate_filename from iles.rs into a new shared src-tauri/src/commands/validation.rs module.
- alidate_character_name in characters.rs now delegates to alidate_filename with error-message rewriting (preserves "Character name" prefix in errors).
- Tightened alidate_character_name to also reject hidden names starting with . — this aligns with list_characters which already skips hidden directories, so a .hidden character name would be invisible anyway.
- Added 	est_validate_character_name_rejects_hidden test to cover the tightened behavior.
- Pre-existing compile blockers fixed along the way: added http module to mod.rs, added models_url/with_auth helpers to http.rs, fixed 	est_connection.rs return type from TestConnectionResult to Result<TestConnectionResult, String> (Tauri async commands with State references must return Result).
- All 19 Rust unit tests + 6 integration tests + 70 Vitest tests pass. Clippy clean.

## 2026-04-26 T7 HTTP request helper consolidation
- Created `src-tauri/src/commands/http.rs` with five `pub(crate)` helpers: `chat_completions_url`, `models_url`, `bearer_value`, `with_auth_json`, `with_auth`.
- URL builders centralize trailing-slash trimming (`trim_end_matches('/')`) + path appending -- previously inconsistent (stream_chat and git.rs didn't trim, test_connection/test_model/models.rs did).
- `with_auth_json` applies both Authorization and Content-Type headers for POST+JSON requests; `with_auth` applies only Authorization for GET requests.
- `test_connection`, `test_model`, and `fetch_models` now accept `State<'_, AppState>` to reuse the shared `reqwest::Client` instead of creating `reqwest::Client::new()` per call. The `base_url` and `api_key` params are still used for the actual request -- `State` is only for client access.
- Tauri v2 constraint: async commands with `State<'_, T>` references MUST return `Result<_, _>` -- this forced `test_connection` and `test_model` return types from `TestConnectionResult` to `Result<TestConnectionResult, String>`. All return values wrapped in `Ok()`. Frontend unaffected since Tauri unwraps the Result.
- `stream_chat.rs` and `git.rs` (generate_checkpoint_name) already used `state.client`; they were refactored to use the shared URL/header helpers only.
- All 19 Rust unit tests + 6 integration tests + 70 Vitest tests pass. Clippy clean.
