import type { RenderElement, RenderNode } from "claude-code";

import { type SettingsView, SPACE, type Token, textWidth } from "../../core/src/index.ts";
import type { Surface } from "./adapters.ts";
import { choice, field } from "./elements.ts";
import { emptyState, stateBox } from "./frame.ts";
import { weight } from "./look.ts";
import { lineWindow, textLine, windowed } from "./window.ts";

// The Settings view (T-2B.8, D-35, T-2C.8), drawn from core's SettingsView on either surface.

export interface SettingsHandlers {
  shown: (text: string) => void;
  choose: (key: string, value: string) => void;
  save: () => void;
}

/** The widest label a Settings row draws beside its control, and the gap after it. */
const SETTINGS_LABEL_COLUMNS = Math.max(
  ...["Shown tasks:", "Collapse:", "Panel mode:", "Debug mode:"].map(textWidth),
);
/** Columns a Settings `Select`'s option label may take at a view width. */
export const settingsOptionRoom = (width: number): number =>
  Math.max(8, width - SETTINGS_LABEL_COLUMNS - 1 - 2);

/** What Settings says when no beads-ui.toml was found (T-2C.12): the view's empty state. */
export const SETTINGS_DEFAULTS_TEXT =
  "No beads-ui.toml yet: these are the defaults. Save to file writes them, with any you change.";

const SETTINGS_HEADING = "Task panel (every session on this machine)";

const present = <T>(items: readonly (T | undefined | false)[]): T[] =>
  items.filter((item): item is T => item !== undefined && item !== false);

/** The band's own settings, drawn inside Settings: framed on the pane, as lines on the band. */
export interface BandSettingsPart {
  block: () => RenderElement;
  lines: () => RenderNode[];
}

/**
 * The Settings view (T-2B.8): the panel's rows from core's settings view, each view's surfaces,
 * then the band's own settings, then one Save to file that writes every table. Its fields and
 * lists draw through the element functions, so a surface with no Input or Select draws buttons.
 * The file's problems draw as its warning state, and no file as its empty state (T-2C.12). On a
 * windowed surface (the band) each row's control and hint are a line each, in its window.
 */
export function drawSettings(
  surface: Surface,
  view: SettingsView,
  options: {
    color: (token: Token) => string;
    problems: readonly string[];
    notice?: { text: string; token: Token };
    band?: BandSettingsPart;
    /** Whether a beads-ui.toml was read; without one Settings draws its empty state. */
    fromFile?: boolean;
    handlers: SettingsHandlers;
  },
): RenderElement {
  const { Box, Text, Button } = surface.ui;
  const lined = windowed(surface);
  const controls = view.rows.map((row) => {
    const control =
      row.kind === "number"
        ? field(surface, {
            key: row.key,
            value: row.value,
            submitLabel: "set",
            onSubmit: (value) => options.handlers.shown(value),
          })
        : choice(surface, {
            key: row.key,
            options: row.options,
            value: row.value,
            onSelect: (value) => options.handlers.choose(row.key, value),
          });
    return {
      row,
      line: Box({
        ...(lined ? { key: `${row.key}:row` } : {}),
        flexDirection: "row",
        gap: SPACE.tight,
        children: [
          Box({ flexShrink: 0, children: [Text({ children: `${row.label}:` })] }),
          control,
        ],
      }),
    };
  });
  const save = Button({
    key: "settings:save",
    label: "Save to file",
    plain: true,
    onPress: () => options.handlers.save(),
  });
  if (lined) {
    return lineWindow(
      surface,
      "settings",
      present<RenderNode>([
        textLine(surface, "settings:heading", SETTINGS_HEADING, { role: "heading" }),
        options.fromFile === false
          ? textLine(surface, "settings:empty", SETTINGS_DEFAULTS_TEXT, { role: "meta" })
          : undefined,
        ...options.problems.map((problem, i) =>
          textLine(surface, `settings:problems:${i}`, problem, { token: "warning" }),
        ),
        options.notice === undefined
          ? undefined
          : textLine(surface, "settings:notice", options.notice.text, {
              token: options.notice.token,
            }),
        ...controls.flatMap(({ row, line }) => [
          line,
          textLine(surface, `${row.key}:hint`, row.hint, { role: "meta" }),
        ]),
        ...(options.band?.lines() ?? []),
        save,
      ]),
    );
  }
  const rows = controls.map(({ row, line }) =>
    Box({
      key: `${row.key}:row`,
      flexDirection: "column",
      children: [line, Text({ ...weight("meta"), children: row.hint })],
    }),
  );
  return Box({
    key: "settings",
    flexDirection: "column",
    children: present<RenderNode>([
      Text({ ...weight("heading"), children: SETTINGS_HEADING }),
      options.fromFile === false
        ? emptyState(surface, "settings:empty", SETTINGS_DEFAULTS_TEXT)
        : undefined,
      options.problems.length === 0
        ? undefined
        : stateBox(surface, { key: "settings:problems", kind: "warning", lines: options.problems }),
      options.notice === undefined
        ? undefined
        : Box({
            key: "settings:notice",
            children: [
              Text({ color: options.color(options.notice.token), children: options.notice.text }),
            ],
          }),
      ...rows,
      options.band?.block(),
      save,
    ]),
  });
}
