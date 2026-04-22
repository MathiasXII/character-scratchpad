import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";

const darkTheme = EditorView.theme({
  "&": {
    color: "#e0e0e0",
    backgroundColor: "#0f0f1a",
    height: "100%"
  },
  ".cm-content": {
    caretColor: "#6c63ff",
    fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", monospace',
    fontSize: "14px",
    lineHeight: "1.6",
    tabSize: "2"
  },
  ".cm-cursor": {
    borderLeftColor: "#6c63ff"
  },
  ".cm-focused .cm-cursor": {
    borderLeftColor: "#6c63ff"
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(108, 99, 255, 0.3) !important"
  },
  ".cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(108, 99, 255, 0.3) !important"
  },
  ".cm-gutters": {
    display: "none"
  },
  ".cm-scroller": {
    overflow: "auto"
  },
  ".cm-focused": {
    outline: "none"
  },
  ".cm-line": {
    padding: "0 12px"
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(108, 99, 255, 0.05)"
  },
  ".cm-placeholder": {
    color: "#a0a0b0",
    fontStyle: "italic",
    padding: "0 12px"
  }
}, { dark: true });

const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, color: "#e0e0e0", fontWeight: "bold", fontSize: "1.4em" },
  { tag: tags.heading2, color: "#e0e0e0", fontWeight: "bold", fontSize: "1.2em" },
  { tag: tags.heading3, color: "#e0e0e0", fontWeight: "bold", fontSize: "1.1em" },
  { tag: tags.heading4, color: "#e0e0e0", fontWeight: "bold" },
  { tag: tags.heading5, color: "#e0e0e0", fontWeight: "bold" },
  { tag: tags.heading6, color: "#a0a0b0", fontWeight: "bold" },
  { tag: tags.strong, color: "#e0e0e0", fontWeight: "bold" },
  { tag: tags.emphasis, color: "#e0e0e0", fontStyle: "italic" },
  { tag: tags.strikethrough, color: "#a0a0b0", textDecoration: "line-through" },
  { tag: tags.link, color: "#7b73ff", textDecoration: "none" },
  { tag: tags.url, color: "#6c63ff" },
  { tag: tags.monospace, color: "#c8c8e0" },
  { tag: tags.quote, color: "#a0a0b0" },
  { tag: tags.comment, color: "#6a6a80" },
  { tag: tags.processingInstruction, color: "#6a6a80" },
  { tag: tags.meta, color: "#6a6a80" },
  { tag: tags.keyword, color: "#c8c8e0" },
  { tag: tags.string, color: "#c8c8e0" },
  { tag: tags.number, color: "#c8c8e0" },
  { tag: tags.bool, color: "#c8c8e0" },
  { tag: tags.null, color: "#a0a0b0" },
  { tag: tags.propertyName, color: "#c8c8e0" },
  { tag: tags.variableName, color: "#c8c8e0" },
  { tag: tags.operator, color: "#a0a0b0" },
  { tag: tags.punctuation, color: "#6a6a80" },
  { tag: tags.bracket, color: "#6a6a80" },
  { tag: tags.separator, color: "#6a6a80" },
  { tag: tags.special(tags.string), color: "#c8c8e0" },
  { tag: tags.definition(tags.variableName), color: "#e0e0e0" },
  { tag: tags.typeName, color: "#c8c8e0" },
  { tag: tags.className, color: "#c8c8e0" },
  { tag: tags.labelName, color: "#c8c8e0" },
  { tag: tags.atom, color: "#c8c8e0" },
  { tag: tags.content, color: "#e0e0e0" },
  { tag: tags.contentSeparator, color: "#6a6a80" },
  { tag: tags.list, color: "#c8c8e0" },
  { tag: tags.inserted, color: "#c8c8e0" },
  { tag: tags.deleted, color: "#a0a0b0" },
  { tag: tags.changed, color: "#c8c8e0" },
]);

function createEditor(parent, options = {}) {
  const extensions = [
    darkTheme,
    keymap.of([...defaultKeymap, ...historyKeymap]),
    history(),
    markdown({ base: markdownLanguage }),
    syntaxHighlighting(markdownHighlight),
    EditorView.lineWrapping,
    EditorState.allowMultipleSelections.of(false)
  ];

  if (options.placeholder) {
    extensions.push(cmPlaceholder(options.placeholder));
  }

  if (options.onChange) {
    extensions.push(EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        options.onChange(update.state.doc.toString());
      }
    }));
  }

  const state = EditorState.create({
    doc: options.doc || "",
    extensions
  });

  const view = new EditorView({
    state,
    parent
  });

  return view;
}

window.createCodeMirrorEditor = createEditor;
window.CodeMirrorView = EditorView;
window.CodeMirrorState = EditorState;
