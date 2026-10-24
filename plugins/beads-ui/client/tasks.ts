import type {
  ClientKeyEvent,
  ClientPointerEvent,
  ClientSurface,
  RenderElement,
  RenderNode,
} from "claude-code";

import type { TaskClientMessage, TaskClientProps, TaskClientRow } from "../core/src/views/menu.ts";

// The Tasks view's task list as a Client (T-2B.5, D-31): it draws the rows the hooks hand it and
// posts what the pointer or a key did to a row. The hooks decide what each post does, with the
// same functions the panel's keys and buttons run. Hover is a style the surface applies, so a
// pointer move draws no frame of ours and posts nothing.

/** The row a region row `y` falls on; the room left for the options menu holds none. */
export function rowAt(props: TaskClientProps, y: number): TaskClientRow | undefined {
  if (!Number.isInteger(y) || y < 0) return undefined;
  const gapAt =
    props.gapAfter === undefined ? -1 : props.rows.findIndex((row) => row.id === props.gapAfter);
  if (gapAt < 0 || y <= gapAt) return props.rows[y];
  if (y <= gapAt + props.gapRows) return undefined;
  return props.rows[y - props.gapRows];
}

/**
 * A button going down on a row: left selects it, or opens it when it is the selected one; right
 * asks for its options menu at the pointer's column. Moves, hovers and releases post nothing.
 */
export function pointerMessage(
  props: TaskClientProps,
  event: ClientPointerEvent,
): TaskClientMessage | undefined {
  if (event.type !== "down") return undefined;
  const row = rowAt(props, event.y);
  if (row === undefined) return undefined;
  if (event.button === "right") {
    return { kind: "menu", id: row.id, x: Math.max(0, Math.floor(event.x)) };
  }
  if (event.button !== "left") return undefined;
  return { kind: row.id === props.selected ? "open" : "select", id: row.id };
}

/**
 * A key while a click has given the Client the focus: Up and Down select the row above or below,
 * Enter opens the selected one, and every key the options menu lists runs its command.
 */
export function keyMessage(
  props: TaskClientProps,
  event: ClientKeyEvent,
): TaskClientMessage | undefined {
  if (event.ctrl === true || event.meta === true) return undefined;
  const at = props.rows.findIndex((row) => row.id === props.selected);
  if (event.key === "up" || event.key === "down") {
    const step = event.key === "up" ? -1 : 1;
    const next = props.rows[at < 0 ? 0 : Math.min(props.rows.length - 1, Math.max(0, at + step))];
    return next === undefined || next.id === props.selected
      ? undefined
      : { kind: "select", id: next.id };
  }
  const selected = props.rows[at];
  if (event.key === "return") {
    return selected === undefined ? undefined : { kind: "open", id: selected.id };
  }
  const bound = props.keys.find((key) => key.key === event.key);
  if (bound === undefined) return undefined;
  return selected === undefined
    ? { kind: "run", command: bound.command }
    : { kind: "run", id: selected.id, command: bound.command };
}

const isProps = (value: unknown): value is TaskClientProps =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as { rows?: unknown }).rows) &&
  Array.isArray((value as { keys?: unknown }).keys);

export default function TaskList(props: unknown, surface: ClientSurface): RenderElement {
  const { Box, Text } = surface.elements;
  if (!isProps(props)) return Box({ children: [] });
  const send = (message: TaskClientMessage | undefined) => {
    if (message !== undefined) surface.post(message);
  };
  surface.onPointer((event) => send(pointerMessage(props, event)));
  surface.onKey((event) => send(keyMessage(props, event)));
  const children = props.rows.flatMap((row): RenderNode[] => {
    const selected = row.id === props.selected;
    const line = Box({
      key: `trow:${row.id}`,
      children: [
        Text({
          wrap: "truncate-end",
          hover: { inverse: true },
          ...(selected ? { bold: true, color: props.selectedColor } : {}),
          children: row.label,
        }),
      ],
    });
    return row.id === props.gapAfter && props.gapRows > 0
      ? [line, Box({ key: "menu-room", height: props.gapRows })]
      : [line];
  });
  return Box({ flexDirection: "column", children });
}
