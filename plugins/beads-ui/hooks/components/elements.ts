import type { RenderElement } from "claude-code";

import { has, type Surface } from "./adapters.ts";

// One function per element a surface can lack (D-35): the element where the surface draws it,
// else its button form, so a component never asks which surface it is on.

export interface ChoiceProps {
  key: string;
  /** The Select's own label; the button form draws it before the buttons. */
  label?: string;
  options: readonly { value: string; label?: string }[];
  value: string;
  onSelect: (value: string) => void;
}

/** A `Select`; without one, a button per option, the chosen one undimmed. */
export function choice(surface: Surface, props: ChoiceProps): RenderElement {
  const { Select, Box, Text, Button } = surface.ui;
  if (has(surface, "Select") && Select !== undefined) {
    return Select({
      key: props.key,
      ...(props.label === undefined ? {} : { label: props.label }),
      options: [...props.options],
      value: props.value,
      onSelect: (value) => props.onSelect(value),
    });
  }
  return Box({
    key: props.key,
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 1,
    children: [
      ...(props.label === undefined ? [] : [Text({ children: `${props.label}:` })]),
      ...props.options.map((option) =>
        Button({
          key: `${props.key}:${option.value}`,
          label: option.label ?? option.value,
          plain: true,
          ...(option.value === props.value ? {} : { dimColor: true }),
          onPress: () => props.onSelect(option.value),
        }),
      ),
    ],
  });
}

export interface FieldProps {
  key: string;
  value: string;
  /** The Input's own label and placeholder; the button form draws the label before the value. */
  label?: string;
  placeholder?: string;
  submitLabel?: string;
  onSubmit: (value: string) => void;
  /** Values the button form offers, one button each, in place of typing. */
  presets?: readonly string[];
  /** The button form's way to type a value: it opens the surface that can (the pane). */
  elsewhere?: { label: string; press: () => void };
}

/** An `Input`; without one, the value, a button per preset, and the button that types elsewhere. */
export function field(surface: Surface, props: FieldProps): RenderElement {
  const { Input, Box, Text, Button } = surface.ui;
  if (has(surface, "Input") && Input !== undefined) {
    return Input({
      key: props.key,
      ...(props.label === undefined ? {} : { label: props.label }),
      ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }),
      value: props.value,
      ...(props.submitLabel === undefined ? {} : { submitLabel: props.submitLabel }),
      onSubmit: (value) => props.onSubmit(value),
    });
  }
  const elsewhere = props.elsewhere;
  return Box({
    key: props.key,
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 1,
    children: [
      Text({
        children: props.label === undefined ? props.value : `${props.label}: ${props.value}`,
      }),
      ...(props.presets ?? []).map((preset) =>
        Button({
          key: `${props.key}:${preset}`,
          label: preset,
          plain: true,
          ...(preset === props.value ? {} : { dimColor: true }),
          onPress: () => props.onSubmit(preset),
        }),
      ),
      ...(elsewhere === undefined
        ? []
        : [
            Button({
              key: `${props.key}:elsewhere`,
              label: elsewhere.label,
              plain: true,
              onPress: () => elsewhere.press(),
            }),
          ]),
    ],
  });
}

export interface MarkdownProps {
  key: string;
  text: string;
  /** The button form's way to read it rendered: it opens the surface that draws Markdown. */
  elsewhere?: { label: string; press: () => void };
}

/** `Markdown`; without it, the source as plain lines and the button that reads it rendered. */
export function markdown(surface: Surface, props: MarkdownProps): RenderElement {
  const { Markdown, Box, Text, Button } = surface.ui;
  if (has(surface, "Markdown") && Markdown !== undefined) {
    return Markdown({ key: props.key, text: props.text });
  }
  const elsewhere = props.elsewhere;
  return Box({
    key: props.key,
    flexDirection: "column",
    children: [
      Text({ children: props.text }),
      ...(elsewhere === undefined
        ? []
        : [
            Button({
              key: `${props.key}:elsewhere`,
              label: elsewhere.label,
              plain: true,
              onPress: () => elsewhere.press(),
            }),
          ]),
    ],
  });
}
