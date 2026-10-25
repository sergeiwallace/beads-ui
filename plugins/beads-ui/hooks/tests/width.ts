// How wide a drawing is, for the reflow tests (T-1B.9). The test kit hands back the element tree,
// not the terminal's frame, so this measures the tree the way Claude Code lays it out.

interface DrawnNode {
  type?: string;
  props?: Record<string, unknown>;
  children?: unknown[];
}

const numberOf = (value: unknown) => (typeof value === "number" ? value : 0);
const asNode = (value: unknown): DrawnNode | undefined =>
  typeof value === "object" && value !== null ? (value as DrawnNode) : undefined;
const widthOf = (text: string) => [...text].length;

/**
 * The fewest terminal columns a drawn element needs, as Claude Code 2.1.310 lays it out: a plain
 * `Button` draws `{hotkey}: {label}` and never shrinks (a framed one `[ {label} ]`), a `Select`
 * its label and widest option beside an open mark, a `Code` block its longest line; `Text`
 * wraps, or is cut with a `truncate` wrap, so it needs one column; a row needs its children side
 * by side with their gaps, unless it wraps; a column its widest child; a `Box` with a `width`
 * exactly that.
 */
export function columnsNeeded(value: unknown): number {
  if (typeof value === "string") return value === "" ? 0 : 1;
  const node = asNode(value);
  if (node === undefined) return 0;
  const props = node.props ?? {};
  const children = node.children ?? [];
  if (typeof props.width === "number") return props.width;
  const pad =
    (props.borderStyle === undefined ? 0 : 2) +
    2 * numberOf(props.paddingX) +
    2 * numberOf(props.padding) +
    numberOf(props.paddingLeft) +
    numberOf(props.paddingRight);
  switch (node.type) {
    case "Text":
      return String(props.wrap ?? "wrap").startsWith("truncate") ? 0 : 1;
    case "Button": {
      const label = widthOf(String(props.label ?? ""));
      if (props.plain !== true) return label + 4;
      return label + (props.hotkey === undefined ? 0 : widthOf(String(props.hotkey)) + 2);
    }
    case "Select": {
      const options = Array.isArray(props.options)
        ? (props.options as { value: string; label?: string }[])
        : [];
      const widest = Math.max(0, ...options.map((one) => widthOf(one.label ?? one.value)));
      return (props.label === undefined ? 0 : widthOf(String(props.label)) + 2) + widest + 2;
    }
    case "Input":
      return (props.label === undefined ? 0 : widthOf(String(props.label)) + 2) + 1;
    case "Raster":
    case "Image":
      return numberOf(props.columns);
    case "Code":
      return Math.max(
        0,
        ...String(props.source ?? "")
          .split("\n")
          .map(widthOf),
      );
    case "Box": {
      const needs = children.map(columnsNeeded);
      if (props.flexDirection !== "row" || props.flexWrap === "wrap") {
        return Math.max(0, ...needs) + pad;
      }
      const gap = numberOf(props.columnGap ?? props.gap);
      return needs.reduce((sum, need) => sum + need, 0) + gap * Math.max(0, needs.length - 1) + pad;
    }
    default:
      return 0;
  }
}

/**
 * Every place a drawing passes its width: the whole tree against `columns`, and each `Box` with
 * a `width` against the columns its contents need. Empty when every line fits.
 */
export function overflows(drawn: unknown, columns: number): string[] {
  const found: string[] = [];
  const need = columnsNeeded(drawn);
  if (need > columns) found.push(`the drawing needs ${need} of ${columns} columns`);
  const walk = (value: unknown) => {
    const node = asNode(value);
    if (node === undefined) return;
    const width = node.props?.width;
    if (typeof width === "number") {
      const inner = columnsNeeded({ ...node, props: { ...node.props, width: undefined } });
      if (inner > width) {
        found.push(`${String(node.props?.key ?? node.type)} needs ${inner} of ${width}`);
      }
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(drawn);
  return found;
}
