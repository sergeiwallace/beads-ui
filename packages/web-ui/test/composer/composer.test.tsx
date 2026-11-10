import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  INSERT_LINE_BREAK_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  type LexicalEditor,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Composer } from "../../src/composer/Composer.tsx";
import type { Skill } from "../../src/composer/skills.ts";
import { FAKE_AWS_KEY, installClipboardStubs, pasteIntoEditor, typeIntoEditor } from "./harness.ts";

// The composer port's parity inventory (web app design T-W1.3, D-4): the same behaviours the ai-core
// dashboard's composer tests pin, run against the ported component. Kept: the multi-line editor with
// its submit and newline keys, the skill typeahead and the skill tokens' marking, the Markdown record,
// the editor's accessible name and focus order, and the catalog's unknown and unavailable states.

const CATALOG: Skill[] = [
  { name: "implement", source: "installed", description: "the dev cycle" },
  { name: "beads-task", source: "builtin", description: null },
];

interface Harness {
  editor(): LexicalEditor;
  markdown(): string;
  submits(): number;
}

/** The composer with `CATALOG`, or with no catalog given when `loadSkills` reads one. */
function renderComposer(loadSkills?: () => Promise<Skill[]>) {
  const skills = loadSkills === undefined ? CATALOG : undefined;
  let editor: LexicalEditor | null = null;
  let markdown = "";
  let submits = 0;
  render(
    <Composer
      {...(skills === undefined ? {} : { skills })}
      {...(loadSkills === undefined ? {} : { loadSkills })}
      onEditorReady={(instance) => {
        editor = instance;
      }}
      onChange={(next) => {
        markdown = next;
      }}
      onSubmit={() => {
        submits += 1;
      }}
      submitting={false}
      refusal={null}
    />,
  );
  const harness: Harness = {
    editor: () => {
      if (editor === null) throw new Error("the composer never handed over an editor");
      return editor;
    },
    markdown: () => markdown,
    submits: () => submits,
  };
  return harness;
}

const input = (): HTMLElement => screen.getByTestId("composer-input");

function typeInto(harness: Harness, text: string) {
  act(() => typeIntoEditor(harness.editor(), text));
}

/** Every decorated token on screen, as `name -> verdict`. */
function tokens(): Record<string, string | null> {
  const found: Record<string, string | null> = {};
  for (const element of input().querySelectorAll("[data-skill]")) {
    found[element.getAttribute("data-skill") ?? ""] = element.getAttribute("data-skill-verdict");
  }
  return found;
}

function tokenClasses(name: string): string {
  const element = input().querySelector(`[data-skill="${name}"]`);
  if (element === null) throw new Error(`no token decorated for ${name}`);
  return element.className;
}

beforeEach(() => installClipboardStubs());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("skill token highlighting", () => {
  it("should mark a token valid when the catalog holds its name", async () => {
    const harness = renderComposer();
    typeInto(harness, "/implement");
    await waitFor(() => expect(tokens()).toEqual({ implement: "valid" }));
    expect(tokenClasses("implement")).toContain("skill-token--valid");
  });

  it("should mark a token invalid when the catalog does not hold its name", async () => {
    const harness = renderComposer();
    typeInto(harness, "/nonsense");
    await waitFor(() => expect(tokens()).toEqual({ nonsense: "invalid" }));
    expect(tokenClasses("nonsense")).toContain("skill-token--invalid");
  });

  it("should mark each of several tokens on its own merits", async () => {
    const harness = renderComposer();
    typeInto(harness, "/implement then /nonsense");
    await waitFor(() => expect(tokens()).toEqual({ implement: "valid", nonsense: "invalid" }));
  });

  it("should mark a token valid when it is typed one character at a time", async () => {
    const harness = renderComposer();
    for (const character of "/implement") typeInto(harness, character);
    await waitFor(() => expect(tokens()).toEqual({ implement: "valid" }));
  });

  it("should turn a token invalid again when typing makes it stop matching a skill", async () => {
    const harness = renderComposer();
    for (const character of "/implement") typeInto(harness, character);
    await waitFor(() => expect(tokens()).toEqual({ implement: "valid" }));
    typeInto(harness, "x");
    await waitFor(() => expect(tokens()).toEqual({ implementx: "invalid" }));
  });

  it("should decorate nothing in text that carries no token", async () => {
    const harness = renderComposer();
    typeInto(harness, "just some prose about src/lib/board.ts");
    await waitFor(() => expect(input().textContent).toContain("prose"));
    expect(tokens()).toEqual({});
  });

  it("should re-mark a token once the catalog arrives after it was typed", async () => {
    let editor: LexicalEditor | null = null;
    const props = {
      onEditorReady: (instance: LexicalEditor) => {
        editor = instance;
      },
      onChange: () => undefined,
      onSubmit: () => undefined,
      submitting: false,
      refusal: null,
    };
    const { rerender } = render(<Composer {...props} skills={[]} />);
    act(() => typeIntoEditor(editor as unknown as LexicalEditor, "/implement"));
    await waitFor(() => expect(tokens()).toEqual({ implement: "invalid" }));
    rerender(<Composer {...props} skills={CATALOG} />);
    await waitFor(() => expect(tokens()).toEqual({ implement: "valid" }));
  });
});

describe("the skill typeahead", () => {
  it("should offer the catalog's names matching what follows / and complete the clicked one", async () => {
    const harness = renderComposer();
    typeInto(harness, "run /imp");
    const suggestion = await screen.findByTestId("skill-suggestion-implement");
    expect(screen.queryByTestId("skill-suggestion-beads-task")).toBeNull();
    fireEvent.click(suggestion.querySelector("button") as HTMLElement);
    await waitFor(() => expect(harness.markdown()).toBe("run /implement"));
    expect(tokens()).toEqual({ implement: "valid" });
    expect(screen.queryByTestId("skill-suggestions")).toBeNull();
  });

  it("should offer every name on a bare / and complete the highlighted one on Enter without a newline", async () => {
    const harness = renderComposer();
    typeInto(harness, "/");
    await screen.findByTestId("skill-suggestion-beads-task");
    expect(screen.getByTestId("skill-suggestion-implement")).toBeTruthy();
    act(() => {
      harness.editor().dispatchCommand(KEY_ARROW_DOWN_COMMAND, null as never);
    });
    await waitFor(() =>
      expect(screen.getByTestId("skill-suggestion-implement").getAttribute("aria-selected")).toBe(
        "true",
      ),
    );
    act(() => {
      harness.editor().dispatchCommand(KEY_ENTER_COMMAND, null as never);
    });
    await waitFor(() => expect(harness.markdown()).toBe("/implement"));
    expect(harness.submits()).toBe(0);
  });

  it("should close the suggestions on Escape and offer nothing without a catalog", async () => {
    const harness = renderComposer();
    typeInto(harness, "/imp");
    await screen.findByTestId("skill-suggestions");
    act(() => {
      harness.editor().dispatchCommand(KEY_ESCAPE_COMMAND, null as never);
    });
    await waitFor(() => expect(screen.queryByTestId("skill-suggestions")).toBeNull());
    cleanup();
    const unread = renderComposer(() => new Promise(() => undefined));
    typeInto(unread, "/imp");
    await waitFor(() => expect(tokens()).toEqual({ imp: "unknown" }));
    expect(screen.queryByTestId("skill-suggestions")).toBeNull();
  });
});

describe("Enter does not submit", () => {
  it("should not submit when Enter is pressed", async () => {
    const harness = renderComposer();
    typeInto(harness, "/implement");
    await waitFor(() => expect(tokens()).toEqual({ implement: "valid" }));
    act(() => {
      fireEvent.keyDown(input(), { key: "Enter", code: "Enter" });
    });
    expect(harness.submits()).toBe(0);
  });

  it("should insert a newline rather than submit", async () => {
    const harness = renderComposer();
    typeInto(harness, "first");
    act(() => {
      fireEvent.keyDown(input(), { key: "Enter", code: "Enter" });
    });
    typeInto(harness, "second");
    await waitFor(() => expect(harness.markdown()).not.toBe("firstsecond"));
    expect(harness.markdown()).toContain("first");
    expect(harness.markdown()).toContain("second");
    expect(harness.submits()).toBe(0);
  });

  it("should submit only on the explicit action", () => {
    const harness = renderComposer();
    typeInto(harness, "/implement");
    fireEvent.click(screen.getByTestId("composer-submit"));
    expect(harness.submits()).toBe(1);
  });

  it("should not sit inside a form, so there is no implicit submission", () => {
    renderComposer();
    expect(input().closest("form")).toBeNull();
  });

  it("should not submit when a paragraph break or a line break is inserted", async () => {
    const harness = renderComposer();
    typeInto(harness, "first");
    act(() => {
      harness.editor().dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
    });
    act(() => {
      harness.editor().dispatchCommand(INSERT_LINE_BREAK_COMMAND, false);
    });
    typeInto(harness, "second");
    await waitFor(() => expect(input().textContent).toContain("second"));
    expect(harness.submits()).toBe(0);
  });
});

describe("paste and undo re-render the tokens", () => {
  it("should decorate both tokens in pasted text", async () => {
    const harness = renderComposer();
    act(() => pasteIntoEditor(harness.editor(), "/implement and /nonsense"));
    await waitFor(() => expect(tokens()).toEqual({ implement: "valid", nonsense: "invalid" }));
  });

  it("should re-render the decoration for the text that remains after undo, and restore it after redo", async () => {
    const harness = renderComposer();
    typeInto(harness, "/implement");
    await waitFor(() => expect(tokens()).toEqual({ implement: "valid" }));
    typeInto(harness, " and /nonsense");
    await waitFor(() => expect(tokens()).toEqual({ implement: "valid", nonsense: "invalid" }));
    act(() => {
      harness.editor().dispatchCommand(UNDO_COMMAND, undefined);
    });
    await waitFor(() => expect(tokens()).toEqual({ implement: "valid" }));
    expect(input().textContent).toBe("/implement");
    act(() => {
      harness.editor().dispatchCommand(REDO_COMMAND, undefined);
    });
    await waitFor(() => expect(tokens()).toEqual({ implement: "valid", nonsense: "invalid" }));
  });
});

describe("the stored prompt is Markdown text, never the editor state", () => {
  it("should export a plain token as exactly the text that was typed", async () => {
    const harness = renderComposer();
    typeInto(harness, "run /implement now");
    await waitFor(() => expect(harness.markdown()).toBe("run /implement now"));
  });

  it("should export two tokens across a line break as exactly that Markdown", async () => {
    const harness = renderComposer();
    typeInto(harness, "/implement");
    act(() => {
      harness.editor().dispatchCommand(INSERT_LINE_BREAK_COMMAND, false);
    });
    typeInto(harness, "/beads-task");
    await waitFor(() => expect(harness.markdown()).toBe("/implement\n/beads-task"));
  });

  it("should round-trip a secret-shaped token unchanged, so the guard sees it", async () => {
    const harness = renderComposer();
    typeInto(harness, `use key ${FAKE_AWS_KEY} now`);
    await waitFor(() => expect(harness.markdown()).toBe(`use key ${FAKE_AWS_KEY} now`));
  });
});

describe("the editor's name, region and focus order", () => {
  it("should keep the editor and its action in one region, the editor labelled Prompt text and before the action", () => {
    renderComposer();
    const region = screen.getByTestId("composer-region");
    const action = screen.getByTestId("composer-submit");
    expect(region.contains(action)).toBe(true);
    expect(region.contains(input())).toBe(true);
    expect(region.classList.contains("composer-region")).toBe(true);
    expect(screen.getByLabelText("Prompt text")).toBe(input());
    // The editor comes first in document order, so Tab reaches it before the action.
    expect(input().compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("the skill catalog", () => {
  it("should read the catalog once when none was given", async () => {
    const load = vi.fn(() => Promise.resolve(CATALOG));
    renderComposer(load);
    await waitFor(() => expect(load).toHaveBeenCalledOnce());
  });

  it("should mark a token unknown while the catalog is still in flight", async () => {
    const harness = renderComposer(() => new Promise(() => undefined));
    typeInto(harness, "/implement");
    await waitFor(() => expect(tokens()).toEqual({ implement: "unknown" }));
    expect(tokenClasses("implement")).not.toContain("skill-token--invalid");
    expect(screen.queryByText(/skill catalog unavailable/i)).toBeNull();
  });

  it("should keep tokens unknown and say so when the catalog cannot be read", async () => {
    const harness = renderComposer(() => Promise.reject(new TypeError("Failed to fetch")));
    typeInto(harness, "/implement");
    await waitFor(() => expect(tokens()).toEqual({ implement: "unknown" }));
    expect(screen.getByText(/skill catalog unavailable/i)).toBeTruthy();
  });

  it("should decide validity once the read catalog arrives", async () => {
    const harness = renderComposer(() => Promise.resolve([{ name: "implement" }]));
    typeInto(harness, "/implement /nonsense");
    await waitFor(() => expect(tokens()).toEqual({ implement: "valid", nonsense: "invalid" }));
  });
});
