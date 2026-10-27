import {
  asciiOf,
  colorFor,
  PRESS_CLOSE,
  PRESS_OPEN,
  type ThemeOverrides,
  type Token,
} from "../../core/src/index.ts";

// The look both surfaces draw with (D-43): the `[theme]` colours and the glyph form read at the
// last config read, and the clickable affordance every pressable element draws. One module
// holds them, so the band and the pane draw the same look from the same redraw.

let theme: ThemeOverrides = {};
let ascii = false;

/** Takes the `[theme]` values just read; true when they differ from those drawn. */
export function setTheme(overrides: ThemeOverrides): boolean {
  const changed = JSON.stringify(overrides) !== JSON.stringify(theme);
  theme = { ...overrides };
  return changed;
}

/** Takes `[indicators] ascii` just read; true when it differs from the form drawn. */
export function setAscii(next: boolean): boolean {
  const changed = next !== ascii;
  ascii = next;
  return changed;
}

/** The colour a `Text` draws for `token`: its `[theme]` hex value, else its theme key. */
export const colorOf = (token: Token): string => colorFor(token, theme);

/** The `[theme]` values drawn now, which a picture's colours follow. */
export const themeOverrides = (): ThemeOverrides => theme;

/** `text` as drawn: each glyph of the table in its ASCII form under `[indicators] ascii`. */
export const glyphText = (text: string): string => (ascii ? asciiOf(text) : text);

/**
 * The weight scale (D-43, T-2C.12), one style a text role: a view's title, a heading inside a
 * view, the body, and the meta line (counts, times, hints). The terminal draws bold and dim on
 * every font, so the scale is built from them and the accent.
 */
export type Weight = "title" | "heading" | "body" | "meta";

/** The `Text` props of `role` on the weight scale. */
export function weight(role: Weight): { bold?: true; dimColor?: true; color?: string } {
  if (role === "title") return { bold: true, color: colorOf("accent") };
  if (role === "heading") return { bold: true };
  if (role === "meta") return { dimColor: true };
  return {};
}

/** What the pointer over a pressable row changes (T-2C.12): its background, on a surface with hover. */
export const rowHover = (): { hover: { backgroundColor: string } } => ({
  hover: { backgroundColor: colorOf("surface.hover") },
});

// biome-ignore lint/suspicious/noExplicitAny: element props differ per element kind
type Props = Record<string, any>;
// biome-ignore lint/suspicious/noExplicitAny: the engine's constructors, any element kind
type Ctor = (props: any) => any;

/** The key of the affordance's frame around the button keyed `key`. */
export const pressKey = (key: string): string => `press:${key}`;

/** What the pointer over a pressable element changes, on a surface that draws hover. */
export const PRESS_HOVER = { inverse: true } as const;

const STYLED = Symbol("beads-ui.styled");

const childrenText = (children: unknown): unknown => {
  if (typeof children === "string") return glyphText(children);
  if (Array.isArray(children)) return children.map((child) => childrenText(child));
  return children;
};

/** True when `ui` already draws through styledUi, so a second pass draws nothing twice. */
export const isStyled = (ui: { Button: Ctor }): boolean => STYLED in ui.Button;

const marked = <F extends Ctor>(ctor: F): F => {
  Object.defineProperty(ctor, STYLED, { value: true });
  return ctor;
};

/**
 * The clickable affordance (D-43, T-2C.14), the one component every `Button` is drawn through:
 * the button between a one-cell bracket pair in the `control` token, inside a keyed frame the
 * pointer hovers, the button inverse under hover where the surface draws hover. The brackets
 * and their colour are Text, so a surface that ignores `hover` and `plain` (VS Code) still shows
 * them. A dimmed button keeps its brackets, dimmed with it. The frame costs PRESS_TREE_CHARS of
 * the tree's 100,000 characters, so the brackets carry no key or hover of their own.
 */
function pressable(Box: Ctor, Text: Ctor, Button: Ctor, props: Props): unknown {
  const label = typeof props.label === "string" ? glyphText(props.label) : props.label;
  const key = String(props.key ?? `label:${String(label)}`);
  const dim = props.dimColor === true ? { dimColor: true } : {};
  const bracket = (text: string) => Text({ color: colorOf("control"), ...dim, children: text });
  return Box({
    key: pressKey(key),
    flexDirection: "row",
    flexShrink: 0,
    children: [
      bracket(PRESS_OPEN),
      Button({ ...props, label, plain: true, hover: { ...PRESS_HOVER, ...(props.hover ?? {}) } }),
      bracket(PRESS_CLOSE),
    ],
  });
}

/**
 * `ui` with every `Button` drawn through the clickable affordance and its `Text`, `Button` and
 * `Select` drawing each table glyph in the form the look names. Every drawing entry point (the
 * band, the pane, the confirmation and both surface adapters) draws through it, so no pressable
 * element reaches a surface without the affordance.
 */
export function styledUi<U extends { Box: Ctor; Text: Ctor; Button: Ctor; Select?: Ctor }>(
  ui: U,
): U {
  if (isStyled(ui)) return ui;
  const { Box, Text, Button, Select } = ui;
  return {
    ...ui,
    Text: (props: Props) =>
      Text(
        props.children === undefined ? props : { ...props, children: childrenText(props.children) },
      ),
    Button: marked((props: Props) => pressable(Box, Text, Button, props)),
    ...(Select === undefined
      ? {}
      : {
          Select: (props: Props) =>
            Select({
              ...props,
              options: (props.options as { value: string; label?: string }[]).map((option) =>
                option.label === undefined ? option : { ...option, label: glyphText(option.label) },
              ),
            }),
        }),
  };
}
