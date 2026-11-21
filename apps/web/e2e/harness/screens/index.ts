import { screenRegistry } from "@sergeiwallace/frontend-test-harness";
import { DETAIL_SCREENS } from "./detail.ts";
import { MCP_APP_SCREEN } from "./mcp-app.ts";
import { SIGN_IN_SCREENS } from "./sign-in.ts";
import { VIEW_SCREENS } from "./views.ts";

export { DETAIL_READS } from "./detail.ts";
export { VIEW_READS } from "./views.ts";

const VIEW_PATHS: Readonly<Record<string, string>> = {
  "": "board",
  backlog: "backlog",
  roadmap: "roadmap",
  analytics: "analytics",
  sessions: "sessions",
  review: "review",
  sprints: "sprints",
  queue: "queue",
};

/**
 * Every beads-ui screen: the eight nav views, issue detail, the held item, the signed-out page,
 * the sign-in link states and the MCP App's board view. A URL maps to its screen with the app's
 * base path (`/beads/` on the live deployment) stripped; a used or expired link shows on the
 * exchange URL itself, and the MCP App's host page is about:blank.
 */
export const screens = screenRegistry(
  [...VIEW_SCREENS, ...DETAIL_SCREENS, ...SIGN_IN_SCREENS, MCP_APP_SCREEN],
  (path, url) => {
    if (url.href === "about:blank") return "mcp-app";
    const rest = path.replace(/^\//, "");
    if (rest.startsWith("issues/")) return "issue-detail";
    if (rest === "held") return "held";
    if (rest === "api/auth/v1/exchange") return "sign-in-link-used";
    return VIEW_PATHS[rest];
  },
  { basePath: (url) => (url.pathname.startsWith("/beads/") ? "/beads/" : "/") },
);
