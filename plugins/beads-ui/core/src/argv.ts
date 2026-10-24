import type { BdArgv } from "./model.ts";

// Free-text values go in `--flag=value` form so a value that starts with "-" is never read as a
// flag. A positional id or a status name cannot be protected that way, so it is checked instead.
function checked(kind: string, value: string): string {
  if (value === "" || value.startsWith("-") || /\s/.test(value)) {
    throw new RangeError(`invalid ${kind} for a bd argument: ${JSON.stringify(value)}`);
  }
  return value;
}

export const issueIdArg = (id: string): string => checked("issue id", id);
export const statusArg = (status: string): string => checked("status", status);

/** Every issue in the store, closed ones too: the Node adapter's list (packages/bd-node). */
export function listArgv(): BdArgv {
  return ["bd", "list", "--json", "--all", "--brief", "--limit", "0"];
}

/** How many closed issues the board reads: one page of the done column (BOARD_PAGE_LIMIT). */
export const CLOSED_PAGE_SIZE = 25;

/**
 * The board's reads (D-29, T-1B.8): every issue not closed, then the most recently closed ones,
 * newest first, up to one page of the done column; never every closed issue.
 */
export function boardReadArgvs(): [open: BdArgv, closed: BdArgv] {
  return [
    ["bd", "list", "--json", "--brief", "--limit", "0"],
    [
      "bd",
      "list",
      "--json",
      "--brief",
      "--status",
      "closed",
      "--sort",
      "closed",
      "--limit",
      String(CLOSED_PAGE_SIZE),
    ],
  ];
}

/**
 * The Timeline's own reads (T-2B.9): every closed issue of each of `types`, one read a type, as
 * bd 1.3 takes one `--type` a call. The board's reads hold the open ones and only the newest
 * closed page, so an epic or milestone closed before that page comes from these.
 */
export function timelineReadArgvs(types: readonly string[]): BdArgv[] {
  return types.map((type) => [
    "bd",
    "list",
    "--json",
    "--brief",
    "--status",
    "closed",
    "--type",
    checked("issue type", type),
    "--limit",
    "0",
  ]);
}

/** The store's Dolt head: its commit changes with every write, so it says when to re-read. */
export function headArgv(): BdArgv {
  return ["bd", "vc", "status", "--json"];
}

/** The store bd finds from the directory it runs in, or `no_beads_directory`. */
export function whereArgv(): BdArgv {
  return ["bd", "where", "--json"];
}

export function statusesArgv(): BdArgv {
  return ["bd", "statuses", "--json"];
}

export function readyArgv(): BdArgv {
  return ["bd", "ready", "--json", "--brief", "--limit", "0"];
}

export function showArgv(id: string): BdArgv {
  return ["bd", "show", issueIdArg(id), "--json"];
}

export function historyArgv(id: string): BdArgv {
  return ["bd", "history", issueIdArg(id), "--events", "--json"];
}

/** The guarded status write: bd exits 13 and writes nothing when `shown` is stale. */
export function moveArgv(id: string, to: string, shown: string): BdArgv {
  return [
    "bd",
    "update",
    issueIdArg(id),
    "--status",
    statusArg(to),
    "--if-status",
    statusArg(shown),
    "--json",
  ];
}

export function closeArgv(id: string): BdArgv {
  return ["bd", "close", issueIdArg(id), "--json"];
}

export function reopenArgv(id: string): BdArgv {
  return ["bd", "reopen", issueIdArg(id), "--json"];
}

export function deletePreviewArgv(id: string): BdArgv {
  return ["bd", "delete", issueIdArg(id), "--dry-run"];
}

export function cascadePreviewArgv(id: string): BdArgv {
  return ["bd", "delete", issueIdArg(id), "--cascade", "--dry-run", "--json"];
}

/**
 * The destructive write. Without `cascade` this is the plain delete of an issue bd previewed with
 * no dependents; core never builds the orphaning `--force` for an issue that has them.
 */
export function deleteArgv(id: string, options: { cascade: boolean }): BdArgv {
  const target = issueIdArg(id);
  return options.cascade
    ? ["bd", "delete", target, "--cascade", "--force", "--json"]
    : ["bd", "delete", target, "--force", "--json"];
}
