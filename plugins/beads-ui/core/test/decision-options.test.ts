// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  type DecisionOptionsOutput,
  optionCardMode,
  optionForKey,
  optionsForItem,
  parseDecisionOptions,
} from "../src/index.ts";

// T-W1.2 of the web app design (D-2): option cards from `held_cli.py options` stdout, in the
// shape that command prints: version 1, one entry per review item, its decisions or its error.

const ITEM = "/repos/ai-harness/docs/held/host-c--session-a/2026-11-09-web-app.md";
const OTHER = "/repos/ai-harness/docs/held/host-c--session-a/2026-11-09-notes.md";

const decision = (extra: Record<string, unknown> = {}) => ({
  id: "D-3",
  title: "How a one-key answer is recorded",
  options: [
    { key: "a", label: "Name the option and say a control chose it" },
    { key: "b", label: "Fill the composer and require Send" },
    { key: "c", label: "Both, chosen by a setting" },
  ],
  recommended: "a",
  anchor: "decision-d-3",
  ...extra,
});

const stdout = (items: unknown[], version: unknown = 1): string =>
  JSON.stringify({ version, items });

const item = (path: string, decisions: unknown[], error: unknown = null, kind = "decision") => ({
  item: path,
  kind,
  decisions,
  error,
});

function parsed(text: string): DecisionOptionsOutput {
  const result = parseDecisionOptions(text);
  if (!result.ok) throw new Error(`expected options, got ${JSON.stringify(result.error)}`);
  return result.value;
}

describe("drawing a held decision", () => {
  test("should draw each option with its label and number key and mark the recommendation when the command prints a decision", () => {
    const output = parsed(stdout([item(ITEM, [decision()]), item(OTHER, [], null, "other")]));

    const card = optionsForItem(output, ITEM)?.cards[0];
    expect(card).toEqual({
      id: "D-3",
      title: "How a one-key answer is recorded",
      options: [
        {
          key: "a",
          label: "Name the option and say a control chose it",
          number: 1,
          recommended: true,
        },
        { key: "b", label: "Fill the composer and require Send", number: 2, recommended: false },
        { key: "c", label: "Both, chosen by a setting", number: 3, recommended: false },
      ],
      recommended: "a",
      anchor: "decision-d-3",
    });
    expect(optionCardMode(optionsForItem(output, ITEM))).toBe("cards");
  });

  test("should choose the recommended option on Enter and an option on its number key when a card is shown", () => {
    const card = parsed(stdout([item(ITEM, [decision({ recommended: "b" })])])).items[0]?.cards[0];
    if (card === undefined) throw new Error("no card");

    expect(optionForKey(card, "Enter")?.key).toBe("b");
    expect(optionForKey(card, "1")?.key).toBe("a");
    expect(optionForKey(card, "3")?.key).toBe("c");
    expect(optionForKey(card, "4")).toBeUndefined();
    expect(optionForKey(card, "x")).toBeUndefined();
  });

  test("should choose nothing when Enter or a number key is pressed in a text field", () => {
    const card = parsed(stdout([item(ITEM, [decision()])])).items[0]?.cards[0];
    if (card === undefined) throw new Error("no card");

    expect(optionForKey(card, "Enter", true)).toBeUndefined();
    expect(optionForKey(card, "2", true)).toBeUndefined();
  });

  test("should choose nothing on Enter when the decision recommends no option", () => {
    const card = parsed(stdout([item(ITEM, [decision({ recommended: null })])])).items[0]?.cards[0];
    if (card === undefined) throw new Error("no card");

    expect(card.recommended).toBe(null);
    expect(optionForKey(card, "Enter")).toBeUndefined();
    expect(optionForKey(card, "2")?.key).toBe("b");
  });

  test("should give number keys to the first nine options only when a decision has more", () => {
    const options = "abcdefghij".split("").map((key) => ({ key, label: `option ${key}` }));
    const card = parsed(stdout([item(ITEM, [decision({ options })])])).items[0]?.cards[0];

    expect(card?.options.map((option) => option.number)).toEqual([
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      undefined,
    ]);
  });
});

describe("malformed command output", () => {
  test("should return no options and an error naming the field when an option has no label", () => {
    const broken = decision({
      id: "D-4",
      options: [{ key: "a", label: "Port it" }, { key: "b" }],
    });
    const output = parsed(stdout([item(ITEM, [decision(), broken])]));

    expect(optionsForItem(output, ITEM)).toEqual({
      item: ITEM,
      kind: "decision",
      cards: [],
      error: { field: "items[0].decisions[1].options[1].label", problem: "is missing or empty" },
    });
    expect(optionCardMode(optionsForItem(output, ITEM))).toBe("markdown");
  });

  test("should return no options and an error naming the field when the recommendation names no option", () => {
    const output = parsed(stdout([item(ITEM, [decision({ recommended: "z" })])]));

    expect(optionsForItem(output, ITEM)?.cards).toEqual([]);
    expect(optionsForItem(output, ITEM)?.error).toEqual({
      field: "items[0].decisions[0].recommended",
      problem: "names z, which is not an option",
    });
  });

  test("should return no options and an error naming the field when any other decision field is malformed", () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ id: "" }, "items[0].decisions[0].id"],
      [{ title: 7 }, "items[0].decisions[0].title"],
      [{ anchor: null }, "items[0].decisions[0].anchor"],
      [{ options: "a, b" }, "items[0].decisions[0].options"],
      [{ options: [{ key: "a", label: "only" }] }, "items[0].decisions[0].options"],
      [
        {
          options: [
            { key: "a", label: "one" },
            { key: "a", label: "two" },
          ],
        },
        "items[0].decisions[0].options[1].key",
      ],
      [{ recommended: 1 }, "items[0].decisions[0].recommended"],
    ];
    for (const [fault, field] of cases) {
      const found = optionsForItem(parsed(stdout([item(ITEM, [decision(fault)])])), ITEM);
      expect(found?.cards).toEqual([]);
      expect(found?.error?.field).toBe(field);
    }
  });

  test("should keep every other item's cards when one item's decisions are malformed", () => {
    const output = parsed(
      stdout([item(ITEM, [decision({ anchor: "" })]), item(OTHER, [decision()], null, "blocker")]),
    );

    expect(optionsForItem(output, ITEM)?.cards).toEqual([]);
    expect(optionsForItem(output, OTHER)?.cards).toHaveLength(1);
    expect(optionsForItem(output, OTHER)?.kind).toBe("blocker");
  });

  test("should pass the command's own item error through with no cards when the command reports one", () => {
    const output = parsed(
      stdout([item(ITEM, [], { field: "heading", problem: "line 12: stale generated heading" })]),
    );

    expect(optionsForItem(output, ITEM)).toEqual({
      item: ITEM,
      kind: "decision",
      cards: [],
      error: { field: "heading", problem: "line 12: stale generated heading" },
    });
    const notHeld = parsed(
      stdout([item(ITEM, [], { field: "frontmatter", problem: "the file is not a held item" })]),
    );
    expect(optionsForItem(notHeld, ITEM)?.error?.field).toBe("frontmatter");
  });

  test("should give the item no cards and name the field when its error is not the command's shape", () => {
    const cases: [unknown, string][] = [
      [{ field: "summary", problem: "unknown part" }, "items[0].error.field"],
      [{ field: "block" }, "items[0].error"],
      ["stale heading", "items[0].error"],
      [undefined, "items[0].error"],
    ];
    for (const [error, field] of cases) {
      const row = { item: ITEM, kind: "decision", decisions: [decision()], error };
      const found = optionsForItem(parsed(stdout([row])), ITEM);
      expect(found?.cards).toEqual([]);
      expect(found?.error?.field).toBe(field);
    }
  });

  test("should refuse the whole output and name the field when it is not the options payload", () => {
    const refusals: [string, string][] = [
      ["", "output"],
      ["not json", "output"],
      ["[]", "output"],
      [stdout([], 2), "version"],
      [JSON.stringify({ version: 1 }), "items"],
      [stdout([{ kind: "decision", decisions: [], error: null }]), "items[0].item"],
      [stdout([item(ITEM, [], null, "summary")]), "items[0].kind"],
      [stdout([item(ITEM, [], null, "open-question")]), "items[0].kind"],
    ];
    for (const [text, field] of refusals) {
      const result = parseDecisionOptions(text);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.field).toBe(field);
    }
  });
});

describe("the Markdown fallback", () => {
  test("should draw the Markdown body when the command is unavailable or prints no options for the item", () => {
    const output = parsed(stdout([item(ITEM, [], null, "other")]));

    expect(optionCardMode(undefined)).toBe("markdown");
    expect(optionCardMode(optionsForItem(output, ITEM))).toBe("markdown");
    expect(optionsForItem(output, OTHER)).toBeUndefined();
  });
});
