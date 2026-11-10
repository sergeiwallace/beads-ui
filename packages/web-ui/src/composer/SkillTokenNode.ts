/**
 * The `/skill` token node (web app design D-4, ported from the ai-core dashboard).
 *
 * A **TextNode subclass**, not a decorator node. The ported design allows either,
 * and text is the right one here for two AC-level reasons:
 *
 *  - ``selection handles shall operate on the highlighted tokens`` -- a decorator
 *    node is an atomic non-text island, so a caret cannot sit inside it and a
 *    selection handle has nothing to grab. A TextNode subclass is real text.
 *  - the stored prompt is the markdown text, never the editor state. A TextNode
 *    serializes as its own text content, so `$convertToMarkdownString` already
 *    writes the token back as plain `/<name>` with no custom exporter to drift
 *    out of step with the matcher.
 *
 * Modelled on `@lexical/hashtag`'s `HashtagNode`, which is the shipped prior art
 * for "a TextNode subclass created by a node transform", and the validity flag
 * uses Lexical's own `createState` so clone and JSON are handled by the
 * framework rather than by a hand-written `static clone`.
 */

import {
  $applyNodeReplacement,
  $getState,
  $setState,
  createState,
  type EditorConfig,
  enumValue,
  type LexicalNode,
  TextNode,
} from "lexical";
import { SKILL_VERDICTS, type SkillVerdict } from "./skills.ts";

/**
 * What the catalog says about this token: `valid`, `invalid`, or `unknown`.
 *
 * Carried on the node rather than recomputed in `createDOM` because `createDOM`
 * has no way to read the catalog, and because the catalog arrives asynchronously:
 * a token typed before the fetch returns has to be re-marked, which is a state
 * change the framework can see and re-render.
 *
 * Three states, not a boolean. `enumValue` defaults to the first entry, so a
 * node created before any catalog exists is `unknown` rather than claiming the
 * `invalid` half of a verdict nothing has reached.
 */
export const skillVerdictState = createState("verdict", {
  parse: enumValue<SkillVerdict>([...SKILL_VERDICTS]),
});

export class SkillTokenNode extends TextNode {
  override $config() {
    return this.config("skill-token", {
      extends: TextNode,
      stateConfigs: [{ flat: true, stateConfig: skillVerdictState }],
    });
  }

  /**
   * Write this node's verdict onto its element.
   *
   * Unconditional and idempotent, and called from `updateDOM` without first
   * comparing against the previous node. The comparison is what a cheaper
   * version of this did, and it never fired: `$getState` resolves to the node's
   * *latest* state by default, so `prevNode.verdict()` already returned the new
   * value and `prev !== next` was false every time. The node state was correct
   * and the DOM kept the stale class -- the catalog landing re-marked nothing.
   */
  private mark(element: HTMLElement): void {
    const verdict = this.verdict();
    element.classList.add("skill-token");
    element.classList.toggle("skill-token--valid", verdict === "valid");
    element.classList.toggle("skill-token--invalid", verdict === "invalid");
    // `unknown` carries its own class so the stylesheet can leave the token
    // looking like ordinary text; neither of the verdict classes is applied,
    // so nothing reads as an answer.
    element.classList.toggle("skill-token--unknown", verdict === "unknown");
    // The AC is about what the editor *marks*, so the verdict is also exposed
    // non-visually: a test and a screen reader both read this rather than
    // inferring validity from a colour. Three-valued, because a boolean
    // attribute could not say "no catalog yet".
    element.setAttribute("data-skill", this.skillName());
    element.setAttribute("data-skill-verdict", verdict);
  }

  override createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config);
    this.mark(element);
    return element;
  }

  override updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    if (super.updateDOM(prevNode, dom, config)) return true;
    this.mark(dom);
    return false;
  }

  verdict(): SkillVerdict {
    return $getState(this, skillVerdictState) ?? "unknown";
  }

  setVerdict(verdict: SkillVerdict): this {
    return $setState(this, skillVerdictState, verdict);
  }

  /** The name without the leading slash, which is what the catalog holds. */
  skillName(): string {
    return this.getTextContent().replace(/^\//, "");
  }

  /** A token is one unit: typing before it must not extend it, exactly as a
   * hashtag does not absorb the character typed in front of it. */
  override canInsertTextBefore(): boolean {
    return false;
  }

  override isTextEntity(): true {
    return true;
  }
}

export function $createSkillTokenNode(text: string, verdict: SkillVerdict): SkillTokenNode {
  return $applyNodeReplacement(new SkillTokenNode(text)).setVerdict(verdict);
}

export function $isSkillTokenNode(node: LexicalNode | null | undefined): node is SkillTokenNode {
  return node instanceof SkillTokenNode;
}
