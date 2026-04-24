// Tracked paths configuration for dirty detection.
// These are the files and folders that are checked against the last git commit
// to determine whether the editor has unsaved changes.
//
// When adding new character files or features, add their paths here so the
// dirty indicator stays accurate.

// Static tab files (relative to the character directory)
export const TRACKED_TAB_FILES = {
  instructions: "instructions.txt",
  prompt: "system-prompt.txt",
  description: "description.txt",
  "first-response": "intro.txt",
};

// Folders whose contents are also tracked for dirty detection.
// Each file inside these folders (matching the extensions) counts.
export const TRACKED_FOLDERS = [
  {
    path: "context",
    extensions: [".md", ".txt", ".pdf"],
  },
];
