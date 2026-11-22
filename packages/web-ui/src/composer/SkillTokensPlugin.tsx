import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { registerLexicalTextEntity } from "@lexical/text";
import { mergeRegister } from "@lexical/utils";
import { $getRoot, type LexicalNode, type TextNode } from "lexical";
import { useEffect } from "react";
import { $createSkillTokenNode, $isSkillTokenNode, SkillTokenNode } from "./SkillTokenNode.ts";
import { matchSkillToken, type SkillCatalog, skillVerdict } from "./skills.ts";

/**
 * Decorate every `/skill` token in the editor, typed, pasted or restored by undo.
 *
 * `registerLexicalTextEntity` is the shipped primitive for "turn matching text
 * into a node subclass" -- the same one `@lexical/hashtag` uses -- and it works
 * by registering **node transforms**. That is what keeps the decoration right after a paste or
 * an undo without any paste- or undo-specific code: a transform runs on every
 * text node the reconciler marks dirty, whoever dirtied it and however the text
 * arrived. Hand-rolling a keystroke listener instead would have decorated typed
 * text and silently missed both.
 */
export function SkillTokensPlugin({ catalog }: { catalog: SkillCatalog | null }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return mergeRegister(
      ...registerLexicalTextEntity(
        editor,
        matchSkillToken,
        SkillTokenNode,
        (textNode: TextNode) => {
          const text = textNode.getTextContent();
          return $createSkillTokenNode(text, skillVerdict(text.replace(/^\//, ""), catalog));
        },
      ),
      editor.registerNodeTransform(SkillTokenNode, (node) => {
        const verdict = skillVerdict(node.skillName(), catalog);
        if (node.verdict() !== verdict) node.setVerdict(verdict);
      }),
    );
  }, [editor, catalog]);

  useEffect(() => {
    editor.update(() => {
      const visit = (node: LexicalNode) => {
        if ($isSkillTokenNode(node)) {
          const verdict = skillVerdict(node.skillName(), catalog);
          if (node.verdict() !== verdict) node.setVerdict(verdict);
          return;
        }
        const children = (node as { getChildren?: () => LexicalNode[] }).getChildren?.();
        if (children) for (const child of children) visit(child);
      };
      visit($getRoot());
    });
  }, [editor, catalog]);

  return null;
}
