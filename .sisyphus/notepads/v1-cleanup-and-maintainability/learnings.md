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
