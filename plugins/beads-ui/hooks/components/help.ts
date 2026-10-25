import type { RenderElement, RenderNode } from "claude-code";

import type { Surface } from "./adapters.ts";
import { lineWindow, textLine, textLines, windowed } from "./window.ts";

// The help (T-1.1, D-35, T-2C.8): the keys, the quick-add and filter grammars, the indicators'
// legend and how to focus the pane, drawn from one list of parts on either surface: framed on
// the pane, as lines in the band's window.

/** One part of the help: a title, a line, a line in its own keyed box, or a code block. */
export type HelpPart =
  | { kind: "title"; text: string }
  | { kind: "text"; text: string; key?: string }
  | { kind: "code"; text: string };

/** The help from its parts, with `region` (the pane's help Client) after them where given. */
export function help(
  surface: Surface,
  parts: readonly HelpPart[],
  region?: RenderElement,
): RenderElement {
  const { Box, Text } = surface.ui;
  const Code = (surface.ui as { Code?: (props: { source: string }) => RenderElement }).Code;
  if (windowed(surface)) {
    return lineWindow(
      surface,
      "help",
      parts.flatMap((part, i): RenderNode[] =>
        part.kind === "code"
          ? textLines(surface, `help:${i}`, part.text)
          : [
              textLine(
                surface,
                part.kind === "text" && part.key ? part.key : `help:${i}`,
                part.text,
                {
                  ...(part.kind === "title" ? { role: "heading" as const } : {}),
                },
              ),
            ],
      ),
    );
  }
  const children: RenderNode[] = parts.map((part) => {
    if (part.kind === "title") return Text({ bold: true, children: part.text });
    if (part.kind === "code" && Code !== undefined) return Code({ source: part.text });
    if (part.kind === "text" && part.key !== undefined) {
      return Box({ key: part.key, children: [Text({ children: part.text })] });
    }
    return Text({ children: part.text });
  });
  return Box({
    key: "help",
    flexDirection: "column",
    borderStyle: "round",
    paddingX: 1,
    children: region === undefined ? children : [...children, region],
  });
}
