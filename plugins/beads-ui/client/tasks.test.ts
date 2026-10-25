import type { ClientKeyEvent, ClientPointerEvent, ClientSurface, JsonValue } from "claude-code";
import { describe, expect, test } from "claude-code/testing";

import type { TaskClientProps } from "../core/src/views/menu.ts";
import TaskList, { rowAt } from "./tasks.ts";

// The task list's Client (T-2B.5) called as Claude Code calls it, with a fake surface that keeps
// what it was handed: the tree drawn, the pointer and key listeners, and every post.

interface Drawn {
  type: string;
  props: Record<string, unknown>;
}

function fakeSurface() {
  const posts: JsonValue[] = [];
  let pointer: ((event: ClientPointerEvent) => void) | undefined;
  let key: ((event: ClientKeyEvent) => void) | undefined;
  let states = 0;
  const element =
    (type: string) =>
    (props: Record<string, unknown>): Drawn => ({ type, props });
  const surface = {
    elements: { Box: element("Box"), Text: element("Text") },
    state: undefined,
    columns: 40,
    rows: 4,
    setState: () => {
      states++;
    },
    every: () => () => undefined,
    onPointer: (fn: (event: ClientPointerEvent) => void) => {
      pointer = fn;
      return () => undefined;
    },
    onKey: (fn: (event: ClientKeyEvent) => void) => {
      key = fn;
      return () => undefined;
    },
    post: (data: JsonValue) => {
      posts.push(data);
    },
  };
  return {
    surface: surface as unknown as ClientSurface,
    posts,
    states: () => states,
    point: (event: ClientPointerEvent) => pointer?.(event),
    press: (event: ClientKeyEvent) => key?.(event),
  };
}

const PROPS: TaskClientProps = {
  rows: [
    { id: "BU-1", label: "◐ P1 BU-1 first" },
    { id: "BU-2", label: "● P2 BU-2 second" },
    { id: "BU-3", label: "○ P2 BU-3 third" },
  ],
  selected: "BU-2",
  gapRows: 0,
  keys: [
    { key: "d", command: "card.detail" },
    { key: "m", command: "card.move" },
    { key: "k", command: "panel.menu" },
    { key: "1", command: "tab.board" },
  ],
  selectedColor: "permission",
};

const lines = (tree: unknown): Drawn[] =>
  ((tree as Drawn).props.children as Drawn[]).filter((child) => child.props.key !== "menu-room");

const textOf = (row: Drawn): Drawn => (row.props.children as Drawn[])[0] as Drawn;

describe("the task list's Client", () => {
  test("should draw one keyed row a task, the selected one bold in the focus colour, each lit on hover", () => {
    const { surface } = fakeSurface();
    const rows = lines(TaskList(PROPS, surface));

    expect(rows.map((row) => row.props.key)).toEqual(["trow:BU-1", "trow:BU-2", "trow:BU-3"]);
    expect(rows.map((row) => textOf(row).props.children)).toEqual(PROPS.rows.map((r) => r.label));
    expect(textOf(rows[1] as Drawn).props).toMatchObject({ bold: true, color: "permission" });
    expect(textOf(rows[0] as Drawn).props.bold).toBeUndefined();
    for (const row of rows) expect(textOf(row).props.hover).toEqual({ inverse: true });
  });

  test("should draw a row's indicator gutter before its label, each glyph in its colour and dimmed where handed so", () => {
    const { surface } = fakeSurface();
    const props: TaskClientProps = {
      ...PROPS,
      rows: [
        {
          id: "BU-1",
          label: "◐ P1 BU-1 first",
          gutter: [{ text: "⟳", color: "claude", dim: true }, { text: " " }],
        },
        { id: "BU-2", label: "● P2 BU-2 second", gutter: [{ text: " " }, { text: " " }] },
        { id: "BU-3", label: "○ P2 BU-3 third" },
      ],
    };
    const rows = lines(TaskList(props, surface));

    const [lit, glyph] = textOf(rows[0] as Drawn).props.children as [Drawn, string];
    expect(lit).toEqual({
      type: "Text",
      props: { color: "claude", dimColor: true, children: "⟳" },
    });
    expect(textOf(rows[0] as Drawn).props.children).toEqual([lit, " ", " ", "◐ P1 BU-1 first"]);
    expect(glyph).toBe(" ");
    expect(textOf(rows[1] as Drawn).props.children).toEqual([" ", " ", " ", "● P2 BU-2 second"]);
    expect(textOf(rows[2] as Drawn).props.children).toBe("○ P2 BU-3 third");
  });

  test("should select a row on a left click, open the selected row on a second, and ask for its menu at the pointer on a right click", () => {
    const f = fakeSurface();
    TaskList(PROPS, f.surface);

    f.point({ type: "down", x: 3, y: 0, button: "left" });
    f.point({ type: "down", x: 3, y: 1, button: "left" });
    f.point({ type: "down", x: 12, y: 2, button: "right" });
    f.point({ type: "down", x: 1, y: 2, button: "middle" });

    expect(f.posts).toEqual([
      { kind: "select", id: "BU-1" },
      { kind: "open", id: "BU-2" },
      { kind: "menu", id: "BU-3", x: 12 },
    ]);
  });

  test("should post nothing and draw nothing new for a hover, a move, a release or a click past the rows", () => {
    const f = fakeSurface();
    TaskList(PROPS, f.surface);

    f.point({ type: "enter", x: 0, y: 0 });
    f.point({ type: "move", x: 4, y: 1 });
    f.point({ type: "move", x: 4, y: 2 });
    f.point({ type: "leave", x: 4, y: 2 });
    f.point({ type: "up", x: 4, y: 2, button: "left" });
    f.point({ type: "down", x: 4, y: 9, button: "left" });

    expect(f.posts).toEqual([]);
    expect(f.states()).toBe(0);
  });

  test("should select with Up and Down, open with Enter and run every key the menu lists on the selected row", () => {
    const f = fakeSurface();
    TaskList(PROPS, f.surface);

    f.press({ key: "up" });
    f.press({ key: "down" });
    f.press({ key: "return" });
    f.press({ key: "m" });
    f.press({ key: "k" });
    f.press({ key: "1" });
    f.press({ key: "z" });
    f.press({ key: "d", ctrl: true });

    expect(f.posts).toEqual([
      { kind: "select", id: "BU-1" },
      { kind: "select", id: "BU-3" },
      { kind: "open", id: "BU-2" },
      { kind: "run", id: "BU-2", command: "card.move" },
      { kind: "run", id: "BU-2", command: "panel.menu" },
      { kind: "run", id: "BU-2", command: "tab.board" },
    ]);
  });

  test("should leave the menu's rows under its task empty and map a click below them to the right task", () => {
    const props = { ...PROPS, gapAfter: "BU-1", gapRows: 5 };
    const f = fakeSurface();
    const children = (TaskList(props, f.surface) as unknown as Drawn).props.children as Drawn[];

    expect(children.map((child) => child.props.key)).toEqual([
      "trow:BU-1",
      "menu-room",
      "trow:BU-2",
      "trow:BU-3",
    ]);
    expect(children[1]?.props.height).toBe(5);
    expect(rowAt(props, 0)?.id).toBe("BU-1");
    expect(rowAt(props, 3)).toBeUndefined();
    expect(rowAt(props, 6)?.id).toBe("BU-2");
    f.point({ type: "down", x: 0, y: 7, button: "left" });
    expect(f.posts).toEqual([{ kind: "select", id: "BU-3" }]);
  });

  test("should draw nothing and listen to nothing when its props are not the task list's", () => {
    const f = fakeSurface();
    const tree = TaskList({ rows: "junk" }, f.surface) as unknown as Drawn;

    expect(tree.props.children).toEqual([]);
    f.point({ type: "down", x: 0, y: 0, button: "left" });
    expect(f.posts).toEqual([]);
  });
});
