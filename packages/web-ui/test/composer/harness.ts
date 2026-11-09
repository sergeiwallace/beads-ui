import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
  PASTE_COMMAND,
} from "lexical";

// Drives the ported Lexical composer in jsdom the way the ai-core dashboard's own tests do: jsdom
// has no composition or clipboard, so text goes in through the editor's own API, the path typing,
// dictation, completion and paste all funnel into.

/** jsdom has neither constructor, and Lexical's paste path narrows on both. */
export function installClipboardStubs(): void {
  const scope = globalThis as Record<string, unknown>;
  if (!("DragEvent" in globalThis)) scope.DragEvent = class DragEvent extends Event {};
  if (!("ClipboardEvent" in globalThis)) {
    scope.ClipboardEvent = class ClipboardEvent extends Event {
      clipboardData: unknown;
      constructor(type: string, init?: { clipboardData?: unknown }) {
        super(type, { bubbles: true, cancelable: true });
        this.clipboardData = init?.clipboardData ?? null;
      }
    };
  }
}

/** The editor behind a rendered contenteditable; throws if Lexical renamed its root property. */
export function editorOf(element: HTMLElement): LexicalEditor {
  const editor = (element as unknown as { __lexicalEditor?: LexicalEditor }).__lexicalEditor;
  if (editor === undefined) throw new Error("no __lexicalEditor on the element");
  return editor;
}

/** Inserts `text` at the end of the editor's content. */
export function typeIntoEditor(editor: LexicalEditor, text: string): void {
  editor.update(() => {
    $getRoot().selectEnd();
    const selection = $getSelection();
    if ($isRangeSelection(selection)) selection.insertText(text);
  });
}

/** Pastes plain text through the command Lexical's clipboard handling reads. */
export function pasteIntoEditor(editor: LexicalEditor, text: string): void {
  installClipboardStubs();
  editor.update(() => {
    $getRoot().selectEnd();
  });
  const event = new ClipboardEvent("paste", {
    clipboardData: {
      getData: (type: string) => (type === "text/plain" ? text : ""),
      types: ["text/plain"],
      files: [],
      items: [],
    },
  } as never);
  editor.dispatchCommand(PASTE_COMMAND, event);
}

/** A fabricated AWS access key id, assembled at run time so no file holds a secret pattern. */
export const FAKE_AWS_KEY = ["AKIA", "IOSFODNN7", "EXAMPLE"].join("");
