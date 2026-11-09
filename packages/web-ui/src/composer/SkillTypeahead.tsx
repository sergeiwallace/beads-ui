import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
} from "lexical";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SkillCatalog } from "./skills.ts";

// The `/skill` typeahead. Lexical's LexicalTypeaheadMenuPlugin, which the ai-core composer uses,
// reads its query only from a plain text node, and SkillTokensPlugin turns `/i` into a
// SkillTokenNode as soon as a letter follows the slash; the menu therefore closed at the first
// letter and never offered a skill. This plugin reads the query from whatever text node holds the
// caret, token or not: a `/` at the start of a word, then the name typed so far.

/** The most suggestions drawn at once. */
export const MAX_SUGGESTIONS = 10;

const QUERY = /(^|\s)\/([A-Za-z0-9_:-]*)$/;

interface Query {
  /** The text node holding the caret. */
  key: string;
  /** Where the `/` sits in that node's text. */
  start: number;
  /** Where the caret sits. */
  end: number;
  /** The name typed after the `/`. */
  text: string;
}

export function SkillTypeaheadPlugin({ catalog }: { catalog: SkillCatalog | null }) {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<Query | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
            setQuery(null);
            return;
          }
          const node = selection.anchor.getNode();
          if (!$isTextNode(node)) {
            setQuery(null);
            return;
          }
          const end = selection.anchor.offset;
          const found = QUERY.exec(node.getTextContent().slice(0, end));
          if (found === null) {
            setQuery(null);
            return;
          }
          const text = found[2] ?? "";
          setQuery({ key: node.getKey(), start: end - text.length - 1, end, text });
        });
      }),
    [editor],
  );

  const options = useMemo(() => {
    if (query === null || catalog === null) return [];
    const lower = query.text.toLowerCase();
    return [...catalog]
      .sort()
      .filter((name) => name.toLowerCase().startsWith(lower) && name !== query.text)
      .slice(0, MAX_SUGGESTIONS);
  }, [catalog, query]);
  const queryId = query === null ? null : `${query.key}:${query.start}`;
  const open = options.length > 0 && queryId !== dismissed;
  const current = Math.min(active, Math.max(0, options.length - 1));

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new query starts at the first suggestion.
  useEffect(() => setActive(0), [queryId]);

  const choose = useCallback(
    (name: string) => {
      if (query === null) return;
      editor.update(() => {
        const node = $getNodeByKey(query.key);
        if (!$isTextNode(node)) return;
        const text = node.getTextContent();
        const inserted = `/${name}`;
        node.setTextContent(text.slice(0, query.start) + inserted + text.slice(query.end));
        const caret = query.start + inserted.length;
        node.select(caret, caret);
      });
      setDismissed(null);
    },
    [editor, query],
  );

  useEffect(() => {
    if (!open) return;
    const move = (step: number) => (event: KeyboardEvent | null) => {
      event?.preventDefault();
      setActive((index) => (index + step + options.length) % options.length);
      return true;
    };
    const pick = (event: KeyboardEvent | null) => {
      const name = options[current];
      if (name === undefined) return false;
      event?.preventDefault();
      choose(name);
      return true;
    };
    const unregister = [
      editor.registerCommand(KEY_ARROW_DOWN_COMMAND, move(1), COMMAND_PRIORITY_HIGH),
      editor.registerCommand(KEY_ARROW_UP_COMMAND, move(-1), COMMAND_PRIORITY_HIGH),
      editor.registerCommand(KEY_ENTER_COMMAND, pick, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(KEY_TAB_COMMAND, pick, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          setDismissed(queryId);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    ];
    return () => {
      for (const one of unregister) one();
    };
  }, [editor, open, options, current, choose, queryId]);

  if (!open) return null;
  return (
    <div
      role="listbox"
      aria-label="Skill suggestions"
      className="composer-suggestions"
      data-testid="skill-suggestions"
    >
      {options.map((name, index) => (
        <div
          key={name}
          role="option"
          tabIndex={-1}
          aria-selected={index === current}
          data-testid={`skill-suggestion-${name}`}
        >
          <button
            type="button"
            className="composer-suggestion"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(name)}
          >
            /{name}
          </button>
        </div>
      ))}
    </div>
  );
}
