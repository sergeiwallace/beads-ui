// A drawn tree as text lines, for the design doc's before-and-after captures (D-43) and the
// tests that pin a line's look. The kit hands back the element tree, not the terminal's frame,
// so this lays it out the way tests/width.ts measures it: a column stacks its children, a row
// sets them side by side with their gaps and gives the room left to a `flexGrow` child, a
// border frames its box, and a plain Button draws `{hotkey}: {label}` (a framed one
// `[ {label} ]`). Colour, hover and wrapping are not drawn.

import { decodeRasterCells, RASTER_DEFAULT_COLOR } from "../../core/src/index.ts";

interface DrawnNode {
  type?: string;
  props?: Record<string, unknown>;
  children?: unknown[];
}

const asNode = (value: unknown): DrawnNode | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as DrawnNode)
    : undefined;
const widthOf = (text: string) => [...text].length;
const numberOf = (value: unknown) => (typeof value === "number" ? value : 0);
const pad = (text: string, width: number) => text + " ".repeat(Math.max(0, width - widthOf(text)));
const cut = (text: string, width: number) => [...text].slice(0, Math.max(0, width)).join("");

/** The text a Text node draws on its one line: its strings and its nested Texts, in order. */
function inline(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(inline).join("");
  const node = asNode(value);
  if (node === undefined) return "";
  return (node.children ?? []).map(inline).join("");
}

/**
 * A Raster's cells as text, a line a row: each cell's code point, and `#` for a cell whose
 * background is set (a bar's filled cell), since a capture draws no colour.
 */
function rasterLines(props: Record<string, unknown>): string[] {
  const columns = numberOf(props.columns);
  const cells = typeof props.cells === "string" ? decodeRasterCells(props.cells) : [];
  const text = cells.map((cell) =>
    cell.background !== RASTER_DEFAULT_COLOR ? "#" : String.fromCodePoint(cell.codePoint),
  );
  const rows = Math.max(1, numberOf(props.rows));
  return Array.from({ length: rows }, (_, row) =>
    text.slice(row * columns, (row + 1) * columns).join(""),
  );
}

function block(value: unknown, width: number): string[] {
  if (typeof value === "string") return [cut(value, width)];
  if (Array.isArray(value)) return value.flatMap((child) => block(child, width));
  const node = asNode(value);
  if (node === undefined) return [];
  const props = node.props ?? {};
  switch (node.type) {
    case "Text":
      return [cut(inline(node), width)];
    case "Button": {
      const label = String(props.label ?? "");
      if (props.plain !== true) return [`[ ${label} ]`];
      return [props.hotkey === undefined ? label : `${String(props.hotkey)}: ${label}`];
    }
    case "Select":
      return [
        `${props.label === undefined ? "" : `${String(props.label)}: `}${String(props.value ?? "")} v`,
      ];
    case "Input":
      return [
        `${props.label === undefined ? "" : `${String(props.label)}: `}${String(props.value ?? "")}_`,
      ];
    case "Code":
    case "Markdown":
      return String(props.source ?? props.text ?? "").split("\n");
    case "Raster":
      return rasterLines(props);
    case "Box":
      return box(props, node.children ?? [], width);
    default:
      return [];
  }
}

function box(props: Record<string, unknown>, children: unknown[], outer: number): string[] {
  const own = typeof props.width === "number" ? Math.min(outer, props.width) : outer;
  const padX = numberOf(props.paddingX) + numberOf(props.padding);
  const frame = props.borderStyle === undefined ? 0 : 2;
  const inner = Math.max(0, own - frame - 2 * padX);
  let lines: string[];
  if (props.flexDirection === "row") {
    const gap = numberOf(props.columnGap ?? props.gap);
    const parts = children.map((child) => ({
      lines: block(child, inner),
      grow: numberOf(asNode(child)?.props?.flexGrow) > 0,
    }));
    const widths = parts.map((part) => Math.max(0, ...part.lines.map(widthOf)));
    const used = widths.reduce((sum, one) => sum + one, 0) + gap * Math.max(0, parts.length - 1);
    const grower = parts.findIndex((part) => part.grow);
    if (grower >= 0 && used < inner) widths[grower] = (widths[grower] ?? 0) + inner - used;
    const height = Math.max(0, ...parts.map((part) => part.lines.length));
    // A row is cut at its box's inner width, as the engine cuts a truncated Text in it.
    lines = Array.from({ length: height }, (_, row) =>
      cut(
        parts.map((part, i) => pad(part.lines[row] ?? "", widths[i] ?? 0)).join(" ".repeat(gap)),
        inner,
      ),
    );
  } else {
    lines = children.flatMap((child) => block(child, inner));
  }
  if (padX > 0) lines = lines.map((line) => " ".repeat(padX) + line + " ".repeat(padX));
  if (typeof props.width === "number") {
    lines = lines.map((line) => cut(pad(line, own - frame), own - frame));
  }
  if (frame === 0) return lines;
  const span = Math.max(0, ...lines.map(widthOf));
  return [
    `╭${"─".repeat(span)}╮`,
    ...lines.map((line) => `│${pad(line, span)}│`),
    `╰${"─".repeat(span)}╯`,
  ];
}

/** `tree` as the lines a terminal `columns` wide shows, each cut at `columns`, trailing blanks dropped. */
export function render(tree: unknown, columns: number): string[] {
  return block(tree, columns).map((line) => cut(line, columns).trimEnd());
}
