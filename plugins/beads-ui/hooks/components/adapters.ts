import type { Elements, RenderElement } from "claude-code";

import type { SurfaceId, TaskClientProps } from "../../core/src/index.ts";
import { styledUi } from "./look.ts";

// The two adapters of the component layer (D-35, T-2C.1): what each surface can draw, handed to
// every component, so one component draws a view on the band and on the pane.

/** The elements a component may ask for that a surface can lack; Box, Text and Button are everywhere. */
export type ElementKind = "Input" | "Select" | "Markdown";
export const ELEMENT_KINDS: readonly ElementKind[] = ["Input", "Select", "Markdown"];

type Terminal = Elements["terminal"];
export type SurfaceUi = Pick<Terminal, "Box" | "Text" | "Button"> &
  Partial<Pick<Terminal, ElementKind>>;

/** The task list's Client region, where the surface mounts one (T-2B.5, D-31). */
export type TasksRegion = (props: TaskClientProps, width: number, height: number) => RenderElement;

/** The terminal's Raster (T-2B.9): a grid of coloured cells. */
export type RasterElement = Terminal["Raster"];

/**
 * A surface's profile and its element constructors: the adapter interface every component draws
 * through. `columns` is the view's width, `rows` the rows it may take (undefined: as many as it
 * needs), `short` the short-height rule of T-1B.9, `elements` the kinds of ElementKind it draws.
 */
export interface Surface {
  readonly id: SurfaceId;
  readonly ui: SurfaceUi;
  readonly columns: number;
  readonly rows: number | undefined;
  readonly short: boolean;
  readonly elements: ReadonlySet<ElementKind>;
  /** Where a Client mounts: the task list draws its rows in one. */
  readonly client?: TasksRegion;
  /** Where a Raster draws: the Timeline's bars. */
  readonly raster?: RasterElement;
}

/**
 * The band's elements, measured with Claude Code 2.1.310's test kit (D-35's as-built note): the
 * `AbovePrompt` site resolves every terminal element and draws Select, Input and Markdown. A band
 * handed only Box, Text and Button, as `drawBand`'s is, draws the button forms (`has`).
 */
export const BAND_ELEMENTS: ReadonlySet<ElementKind> = new Set(ELEMENT_KINDS);
/** The pane's: every element kind. */
export const PANE_ELEMENTS: ReadonlySet<ElementKind> = new Set(ELEMENT_KINDS);

/** The band adapter: the elements it was handed, its columns and its maxRows, short always. */
export function bandSurface(ui: SurfaceUi, size: { columns: number; maxRows?: number }): Surface {
  const { Box, Text, Button, Input, Select, Markdown } = styledUi(ui);
  return {
    id: "band",
    ui: {
      Box,
      Text,
      Button,
      ...(Input === undefined ? {} : { Input }),
      ...(Select === undefined ? {} : { Select }),
      ...(Markdown === undefined ? {} : { Markdown }),
    },
    columns: size.columns,
    rows: size.maxRows,
    short: true,
    elements: BAND_ELEMENTS,
  };
}

/** The pane adapter: every element, the view's columns and rows, and its Client and Raster. */
export function paneSurface(
  ui: SurfaceUi,
  size: { columns: number; rows?: number; short: boolean },
  extras: { client?: TasksRegion; raster?: RasterElement } = {},
): Surface {
  return {
    id: "pane",
    ui: styledUi(ui),
    columns: size.columns,
    rows: size.rows,
    short: size.short,
    elements: PANE_ELEMENTS,
    ...(extras.client === undefined ? {} : { client: extras.client }),
    ...(extras.raster === undefined ? {} : { raster: extras.raster }),
  };
}

/** True when the surface draws `kind` and was handed its constructor. */
export const has = (surface: Surface, kind: ElementKind): boolean =>
  surface.elements.has(kind) && surface.ui[kind] !== undefined;
