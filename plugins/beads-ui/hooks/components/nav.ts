import type { RenderElement, RenderNode } from "claude-code";

import {
  type NavEntry,
  type NavItem,
  type NavLayout,
  navLayout,
  SIDE_NAV_COLUMNS,
  SIDE_NAV_GAP,
} from "../../core/src/index.ts";
import type { Surface } from "./adapters.ts";

// The nav each surface draws (T-2B.1, D-35), from the view registry's entries on that surface.

const navButton = (surface: Surface, item: NavItem, press: (item: NavItem) => void) =>
  surface.ui.Button({
    key: item.key,
    label: item.label,
    hotkey: item.hotkey,
    plain: true,
    ...(item.planned || !item.active ? { dimColor: true } : {}),
    onPress: () => press(item),
  });

/** The nav as a bar of buttons packed into rows that each fit the surface. */
export function navBar(
  surface: Surface,
  nav: NavLayout,
  press: (item: NavItem) => void,
): RenderElement {
  const { Box } = surface.ui;
  return Box({
    key: "nav",
    flexDirection: "column",
    children: nav.rows.map((row, i) =>
      Box({
        key: `nav:${i}`,
        flexDirection: "row",
        columnGap: nav.gap,
        children: row.map((item) => navButton(surface, item, press)),
      }),
    ),
  });
}

/**
 * The nav and the view beside or below it (T-2B.1): a framed side nav one entry a row, or the
 * nav bar above the view.
 */
export function navFrame(
  surface: Surface,
  nav: NavLayout,
  press: (item: NavItem) => void,
  content: readonly RenderNode[],
): RenderElement {
  const { Box } = surface.ui;
  if (nav.kind === "side") {
    return Box({
      flexDirection: "row",
      gap: SIDE_NAV_GAP,
      children: [
        Box({
          key: "nav",
          flexDirection: "column",
          borderStyle: "round",
          width: SIDE_NAV_COLUMNS,
          flexShrink: 0,
          children: nav.items.map((item) => navButton(surface, item, press)),
        }),
        Box({
          key: "view",
          flexDirection: "column",
          width: nav.viewColumns,
          children: [...content],
        }),
      ],
    });
  }
  return Box({
    flexDirection: "column",
    children: [
      navBar(surface, nav, press),
      Box({ key: "view", flexDirection: "column", children: [...content] }),
    ],
  });
}

/** The band's nav (D-36's overview): a bar, as above the prompt, of the views the band draws. */
export const bandNav = (columns: number, entries: readonly NavEntry[], active: string): NavLayout =>
  navLayout(columns, "inline", undefined, active, columns, entries);
