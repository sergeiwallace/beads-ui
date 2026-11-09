import { $convertToMarkdownString, TEXT_FORMAT_TRANSFORMERS } from "@lexical/markdown";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { COMMAND_PRIORITY_CRITICAL, KEY_ENTER_COMMAND, type LexicalEditor } from "lexical";
import { useEffect, useMemo, useState } from "react";
import "./composer.css";
import { SkillTokenNode } from "./SkillTokenNode.ts";
import { SkillTokensPlugin } from "./SkillTokensPlugin.tsx";
import { SkillTypeaheadPlugin } from "./SkillTypeahead.tsx";
import { catalogOf, type Skill } from "./skills.ts";

/**
 * The prompt composer, ported from the ai-core queue dashboard's approved composer (web app
 * design D-4, T-W1.3): Lexical rich text, a trigger-based `/skill` typeahead, and
 * `@lexical/markdown` serialization, so the stored prompt stays plain Markdown text and the
 * editor state is never the record.
 *
 * Only `TEXT_FORMAT_TRANSFORMERS` is used, not the full `TRANSFORMERS` set. The element
 * transformers reference HeadingNode, QuoteNode, ListNode, CodeNode and LinkNode, so importing
 * them would pull every one of those node classes into the chunk for formatting a prompt box does
 * not offer. The text-format set is pure `TextNode` formats (bold, italic, strikethrough, inline
 * code), which serializes to Markdown.
 */

/** The composer markdown is what gets stored, so the export is the source of truth. */
const TRANSFORMERS = TEXT_FORMAT_TRANSFORMERS;

/**
 * Enter inserts a newline and never submits: submission is the explicit Queue prompt action.
 *
 * Registered at CRITICAL priority and returning `false` so Lexical's own
 * rich-text Enter handling still runs (that is what inserts the newline) while
 * nothing above it can turn the key into a submit. The composer is deliberately
 * not inside a `<form>` either, so there is no implicit submission to suppress.
 */
function EnterInsertsNewlinePlugin({ onEnter }: { onEnter: () => void }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      () => {
        onEnter();
        return false;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor, onEnter]);
  return null;
}

/** Hand the editor to the caller once the context exists. */
function EditorReadyPlugin({ onReady }: { onReady: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    onReady(editor);
  }, [editor, onReady]);
  return null;
}

/**
 * The explicit submit action. It reads the editor's Markdown at the click, so a click that lands
 * before the last change has reached `onChange` still submits the text on screen.
 */
function SubmitButton({
  onSubmit,
  submitting,
  label,
}: {
  onSubmit: (markdown: string) => void;
  submitting: boolean;
  label: string;
}) {
  const [editor] = useLexicalComposerContext();
  return (
    <button
      type="button"
      className="bu-button"
      data-testid="composer-submit"
      onClick={() =>
        onSubmit(editor.getEditorState().read(() => $convertToMarkdownString(TRANSFORMERS)))
      }
      disabled={submitting}
    >
      {label}
    </button>
  );
}

export type ComposerProps = {
  /** Called with the markdown text the editor currently holds, on every change. */
  onChange: (markdown: string) => void;
  /** The explicit Queue prompt action, the only thing that submits, with the text it submits. */
  onSubmit: (markdown: string) => void;
  submitting: boolean;
  /** Set when the secret guard refused the text; rendered beside the action. */
  refusal: string | null;
  /** A catalog to use as it is; with none, `loadSkills` fetches one. */
  skills?: Skill[];
  /** Reads the skill catalog once per mount; absent or failing, every token stays unknown. */
  loadSkills?: () => Promise<Skill[]>;
  /** The submit action's label. */
  submitLabel?: string;
  /**
   * Handed the editor once it exists.
   *
   * jsdom has no composition or clipboard, so a test drives the editor through its own API
   * (`insertText`, `PASTE_COMMAND`, `UNDO_COMMAND`) rather than through synthetic events Lexical
   * never reads.
   */
  onEditorReady?: (editor: LexicalEditor) => void;
};

export function Composer({
  onChange,
  onSubmit,
  submitting,
  refusal,
  skills,
  loadSkills,
  submitLabel = "Queue prompt",
  onEditorReady,
}: ComposerProps) {
  // Not seeded from `skills`: a `useState` initial value is ignored on every
  // later render, so seeding it here made a changed `skills` prop silently
  // unobservable. The catalog is derived below instead, so there is one source
  // of truth rather than a copy that can go stale.
  const [fetched, setFetched] = useState<Skill[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  // Fetched once per mount. The editor works before it lands: every token reads `unknown` until
  // the catalog arrives, and SkillTokensPlugin re-marks them when it does.
  useEffect(() => {
    if (skills) return;
    if (loadSkills === undefined) {
      setUnavailable(true);
      return;
    }
    let active = true;
    loadSkills().then(
      (loaded) => {
        if (active) setFetched(loaded);
      },
      () => {
        // A composer that cannot reach the catalog still has to be usable, and every token stays
        // `unknown`: a transport failure is not evidence that a real skill is not a skill.
        if (active) setUnavailable(true);
      },
    );
    return () => {
      active = false;
    };
  }, [skills, loadSkills]);

  // `null` until a catalog actually exists. `catalogOf([])` would be an empty
  // catalog, which is a real answer ("the server has no skills") and marks every
  // token invalid -- the wrong thing to say while the fetch is in flight.
  const catalog = useMemo(() => {
    const loaded = skills ?? fetched;
    return loaded ? catalogOf(loaded) : null;
  }, [skills, fetched]);

  return (
    <LexicalComposer
      initialConfig={{
        namespace: "queue-prompt-composer",
        nodes: [SkillTokenNode],
        theme: {},
        onError: (error) => {
          throw error;
        },
      }}
    >
      {/* The composer and its action sit in a bottom-anchored region sized against the visual
          viewport, so the virtual keyboard cannot push the action off screen. */}
      <div className="composer-region" data-testid="composer-region">
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              aria-label="Prompt text"
              className="composer-input"
              data-testid="composer-input"
            />
          }
          placeholder={null}
          ErrorBoundary={({ children }) => <>{children}</>}
        />
        {/* History is what makes undo possible, and the token decoration survives it. */}
        <HistoryPlugin />
        <SkillTokensPlugin catalog={catalog} />
        <SkillTypeaheadPlugin catalog={catalog} />
        <EnterInsertsNewlinePlugin onEnter={() => undefined} />
        {onEditorReady && <EditorReadyPlugin onReady={onEditorReady} />}
        <OnChangePlugin
          ignoreSelectionChange
          onChange={(editorState) => {
            editorState.read(() => onChange($convertToMarkdownString(TRANSFORMERS)));
          }}
        />
        <SubmitButton onSubmit={onSubmit} submitting={submitting} label={submitLabel} />
        {unavailable && (
          <p className="composer-note" data-testid="composer-catalog-note">
            skill catalog unavailable
          </p>
        )}
        {refusal && (
          <p role="alert" className="composer-refusal">
            {refusal}
          </p>
        )}
      </div>
    </LexicalComposer>
  );
}

export default Composer;
