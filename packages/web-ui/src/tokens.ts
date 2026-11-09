import type { Token } from "@beads-ui/core";

/** The CSS variable theme.css defines for a core token: `status.wip` is `--bu-status-wip`. */
export const tokenProperty = (token: Token): string => `--bu-${token.replace(".", "-")}`;

export const tokenVar = (token: Token): string => `var(${tokenProperty(token)})`;
