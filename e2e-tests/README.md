# llm-chat E2E tests

This directory contains the WebDriverIO test setup for the Tauri v2 app.

## Prerequisites

- Node.js installed
- The app project dependencies installed at the repository root
- `tauri-driver` available on your `PATH`
- A Windows or Linux environment supported by Tauri v2

## Install

From this directory:

```bash
npm install
```

## Build the app for tests

The WebDriverIO config builds the app automatically in debug mode before the session starts, using:

```bash
npm run build:app
```

That command resolves to the root project and runs:

```bash
npm run tauri build -- --debug --no-bundle
```

On Windows, the test config expects the debug binary at:

```text
../src-tauri/target/debug/llm-chat.exe
```

## Run the E2E suite

```bash
npm test
```

This will:

1. Build the app in debug mode
2. Start `tauri-driver` on port `4444`
3. Run the WebDriverIO specs in `specs/`

## Notes

- The suite uses the `wry` browser capability for Tauri.
- Do not run the E2E suite unless `tauri-driver` is installed and the debug app build succeeds.
- The current spec only validates the shell and basic UI presence; it does not interact with the backend.
