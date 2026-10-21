import type { BdArgv, Priority } from "@beads-ui/core";
import { issueIdArg, statusArg } from "@beads-ui/core/argv.ts";

/** The fields `bd update` writes, in the flag forms the core's editArgv and moveArgv use. */
export interface UpdateFields {
  title?: string;
  description?: string;
  status?: string;
  priority?: Priority;
  type?: string;
  assignee?: string;
  due?: string;
  estimatedMinutes?: number;
  addLabels?: readonly string[];
  removeLabels?: readonly string[];
}

/** bd writes nothing and exits 13 when a guard no longer holds. */
export interface UpdateGuard {
  ifStatus?: string;
  /** `""` requires the issue to be unassigned. */
  ifAssignee?: string;
}

// bd reads a repeated label flag as a comma-separated list, so a comma would split one label.
function labelArg(label: string): string {
  if (label === "" || label.includes(",")) {
    throw new RangeError(`invalid label for a bd argument: ${JSON.stringify(label)}`);
  }
  return label;
}

export function updateArgv(id: string, fields: UpdateFields, guard: UpdateGuard = {}): BdArgv {
  const flags: string[] = [];
  if (fields.title !== undefined) flags.push(`--title=${fields.title}`);
  if (fields.description !== undefined) flags.push(`--description=${fields.description}`);
  if (fields.status !== undefined) flags.push("--status", statusArg(fields.status));
  if (fields.priority !== undefined) flags.push(`--priority=${fields.priority}`);
  if (fields.type !== undefined) flags.push(`--type=${fields.type}`);
  if (fields.assignee !== undefined) flags.push(`--assignee=${fields.assignee}`);
  if (fields.due !== undefined) flags.push(`--due=${fields.due}`);
  if (fields.estimatedMinutes !== undefined) flags.push(`--estimate=${fields.estimatedMinutes}`);
  for (const label of fields.addLabels ?? []) flags.push(`--add-label=${labelArg(label)}`);
  for (const label of fields.removeLabels ?? []) flags.push(`--remove-label=${labelArg(label)}`);
  // bd refuses a guard with no field update ("Requires a field update").
  if (flags.length === 0) throw new RangeError("bd update needs at least one field to write");
  if (guard.ifStatus !== undefined) flags.push("--if-status", statusArg(guard.ifStatus));
  if (guard.ifAssignee !== undefined) flags.push(`--if-assignee=${guard.ifAssignee}`);
  return ["bd", "update", issueIdArg(id), ...flags, "--json"];
}
