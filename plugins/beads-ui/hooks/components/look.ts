import { asciiOf, colorFor, type ThemeOverrides, type Token } from "../../core/src/index.ts";

// The look both surfaces draw with (D-43): the `[theme]` colours and the glyph form read at the
// last config read. One module holds them, so the band and the pane draw the same look from
// the same redraw.

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

/** `text` as drawn: each glyph of the table in its ASCII form under `[indicators] ascii`. */
export const glyphText = (text: string): string => (ascii ? asciiOf(text) : text);

// biome-ignore lint/suspicious/noExplicitAny: element props differ per element kind
type Props = Record<string, any>;
// biome-ignore lint/suspicious/noExplicitAny: the engine's constructors, any element kind
type Ctor = (props: any) => any;

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
 * `ui` with its `Text`, `Button` and `Select` drawing every table glyph in the form the look
 * names. Every drawing entry point (the band, the pane, the confirmation and both surface
 * adapters) draws through it.
 */
export function styledUi<U extends { Text: Ctor; Button: Ctor; Select?: Ctor }>(ui: U): U {
  if (isStyled(ui)) return ui;
  const { Text, Button, Select } = ui;
  const styled: U = {
    ...ui,
    Text: (props: Props) =>
      Text(
        props.children === undefined ? props : { ...props, children: childrenText(props.children) },
      ),
    Button: marked((props: Props) =>
      Button(typeof props.label === "string" ? { ...props, label: glyphText(props.label) } : props),
    ),
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
  return styled;
}
