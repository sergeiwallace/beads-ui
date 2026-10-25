import type { RenderElement } from "claude-code";

import { buttonWidth, hotkeyOf, type PanelAction, packRows, tierOf } from "../../core/src/index.ts";
import type { Surface } from "./adapters.ts";

/**
 * The action bar (T-1B.9, D-35): `actions` as buttons labelled for the surface's tier and packed
 * into rows that each fit its columns, full words from 72 columns, a short word from 48, the
 * shortest form below; a press runs the action's command.
 */
export function actionBar(
  surface: Surface,
  actions: readonly PanelAction[],
  run: (command: string) => void,
  key = "toolbar",
): RenderElement {
  const { Box, Button } = surface.ui;
  const tier = tierOf(surface.columns);
  const gap = tier === "narrow" ? 1 : 2;
  const items = actions.map((action) => {
    const hotkey = hotkeyOf(action.command);
    const label = action.labels[tier];
    return { ...action, label, hotkey, width: buttonWidth(label, hotkey) };
  });
  return Box({
    key,
    flexDirection: "column",
    children: packRows(items, surface.columns, gap).map((row, i) =>
      Box({
        key: `${key}:${i}`,
        flexDirection: "row",
        columnGap: gap,
        children: row.map((item) =>
          Button({
            key: item.key,
            label: item.label,
            hotkey: item.hotkey,
            plain: true,
            onPress: () => run(item.command),
          }),
        ),
      }),
    ),
  });
}
