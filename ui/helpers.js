export const MARKDOWN_RENDER_CONFIG = {
  ADD_TAGS: ["details", "summary"],
  ADD_ATTR: ["checked", "disabled"],
};

export function formatError(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return typeof error === "string" ? error : String(error);
}

export function renderMarkdown(markdown) {
  return DOMPurify.sanitize(marked.parse(markdown), MARKDOWN_RENDER_CONFIG);
}

export function getCharacterDir(workFolder, characterName) {
  return workFolder && characterName ? workFolder + "/" + characterName : "";
}
