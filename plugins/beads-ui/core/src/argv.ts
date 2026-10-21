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

export function listArgv(): BdArgv {
  return ["bd", "list", "--json", "--all", "--brief", "--limit", "0"];
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
  ];
}

export function closeArgv(id: string): BdArgv {
  return ["bd", "close", issueIdArg(id)];
}

export function reopenArgv(id: string): BdArgv {
  return ["bd", "reopen", issueIdArg(id)];
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
    ? ["bd", "delete", target, "--cascade", "--force"]
    : ["bd", "delete", target, "--force"];
}
