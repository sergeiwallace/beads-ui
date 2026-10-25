import type { RenderElement } from "claude-code";

import {
  entriesOn,
  NAV_ENTRIES,
  type NavEntry,
  type SurfaceId,
  type SurfaceOverrides,
} from "../../core/src/index.ts";
import type { Surface } from "./adapters.ts";

/**
 * A view, registered once (D-35): its nav entry (id, COMMANDS id, labels, glyph, planned and the
 * surfaces it draws on, both unless named) and the drawing of its body through the components,
 * on whichever surface it is handed. A view with no `draw` is one the pane still draws itself,
 * until T-2C.8 moves it.
 */
export interface ViewEntry extends NavEntry {
  draw?: (surface: Surface) => RenderElement;
}

/** The views every surface's nav and drawing come from, in nav order. */
export class ViewRegistry {
  private readonly list: ViewEntry[];

  constructor(entries: readonly NavEntry[] = NAV_ENTRIES) {
    this.list = entries.map((entry) => ({ ...entry }));
  }

  /** Adds a view after the others, or replaces the one with its id in place. */
  register(entry: ViewEntry): void {
    const at = this.list.findIndex((one) => one.view === entry.view);
    if (at === -1) this.list.push(entry);
    else this.list[at] = entry;
  }

  /** Gives a registered view its drawing, keeping its entry. */
  drawWith(view: string, draw: (surface: Surface) => RenderElement): void {
    const entry = this.get(view);
    if (entry !== undefined) this.register({ ...entry, draw });
  }

  get(view: string): ViewEntry | undefined {
    return this.list.find((one) => one.view === view);
  }

  byCommand(command: string): ViewEntry | undefined {
    return this.list.find((one) => one.command === command);
  }

  all(): readonly ViewEntry[] {
    return this.list;
  }

  /** The views `surface` draws under `overrides` (`[surfaces]` and Settings), in order. */
  on(surface: SurfaceId, overrides: SurfaceOverrides): ViewEntry[] {
    return entriesOn(this.list, surface, overrides);
  }
}
