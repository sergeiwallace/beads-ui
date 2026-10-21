import type { ClientSurface, RenderElement } from "claude-code";

import { GREETING } from "./greeting.ts";

/**
 * The help panel's Client region, a line the Phase 2 drag board replaces. It
 * imports a sibling file so the import probe covers a Client's own imports.
 */
export default function Hello(_props: unknown, surface: ClientSurface): RenderElement {
  const { Text } = surface.elements;

  return Text({ key: "greeting", children: GREETING });
}
