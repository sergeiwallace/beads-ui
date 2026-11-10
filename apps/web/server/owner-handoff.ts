// An owner change on a task a session has claimed (web app design D-9, T-W2.2): the fleet's
// receiver-first handoff, driven from the web app. The holder's liveness comes from the fleet's own
// liveness check, never a guess. A live holder gets a dispatch of kind handoff-request naming the
// receiver and runs /handoff itself; the server never writes the assignee then. A holder proved
// gone has its abandoned claim released through bd's documented force path, and the receiver gets
// a git-inbox action carrying a pointer only. With liveness unknown nothing is written and the
// page offers a retry. Each handoff's state is read back from the record that proves it.

import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DispatchTarget, Issue, TomlTable, TomlValue } from "@beads-ui/core";
import { parseToml } from "@beads-ui/core";
import { readUserConfig } from "./config.ts";
import {
  type DispatchSummaryBody,
  ownerOf,
  readDispatchSettings,
  writeDispatch,
} from "./dispatch.ts";
import { Serial } from "./dispatch-store/common.ts";
import type { OpenStore } from "./registry.ts";
import { type ApiContext, type ApiReply, type ApiRequest, bdFailure, failure } from "./routes.ts";

/** Where the server keeps the handoffs it started, by task. */
export const HANDOFFS_FILE = "handoffs.json";
/** `fleet-liveness status --json --session <session>@<host>`, the fleet's liveness check. */
export const DEFAULT_LIVENESS_COMMAND = ["fleet-liveness"];
export const DEFAULT_GIT_INBOX_COMMAND = ["git-inbox"];
const TOOL_TIMEOUT_MS = 30_000;

/** The status the receiver sets, which is also the holder's claim (edits.ts CLAIMED_STATUS). */
const CLAIMED = "in_progress";

export type Liveness =
  | { state: "live"; source: string }
  | { state: "gone"; source: string; reason: string }
  | { state: "unknown"; source: string; reason: string };

interface Handoff {
  task: { repo: string; id: string };
  holder: DispatchTarget;
  receiver: DispatchTarget;
  at: string;
  mode: "request" | "git-inbox";
  /** The handoff-request dispatch, for a live holder. */
  dispatch?: string;
  /** The git-inbox message, for a holder proved gone. */
  message?: string;
  confirmed?: { at: string; detail: string };
}

type Run =
  | { kind: "exited"; exitCode: number; stdout: string; stderr: string }
  | { kind: "timeout" }
  | { kind: "unrunnable"; message: string };

function run(argv: readonly string[], cwd?: string): Promise<Run> {
  const [bin, ...args] = argv;
  if (bin === undefined) return Promise.resolve({ kind: "unrunnable", message: "no command" });
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      { encoding: "utf8", timeout: TOOL_TIMEOUT_MS, ...(cwd === undefined ? {} : { cwd }) },
      (error, stdout, stderr) => {
        if (error === null) resolve({ kind: "exited", exitCode: 0, stdout, stderr });
        else if (error.killed === true) resolve({ kind: "timeout" });
        else if (typeof error.code === "number") {
          resolve({ kind: "exited", exitCode: error.code, stdout, stderr });
        } else resolve({ kind: "unrunnable", message: String(error.code ?? error.message) });
      },
    );
  });
}

const firstLine = (value: string): string => value.trim().split("\n")[0] ?? "";
const said = (result: Run): string =>
  result.kind === "timeout"
    ? `did not finish within ${TOOL_TIMEOUT_MS} ms`
    : result.kind === "unrunnable"
      ? `cannot run: ${result.message}`
      : `exit ${result.exitCode}${firstLine(result.stderr) || firstLine(result.stdout) ? `: ${firstLine(result.stderr) || firstLine(result.stdout)}` : ""}`;

const isTable = (value: TomlValue | undefined): value is TomlTable =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const argvOf = (value: TomlValue | undefined): string[] | undefined =>
  Array.isArray(value) && value.length > 0 && value.every((arg) => typeof arg === "string")
    ? (value as string[])
    : undefined;

/** `[handoff] liveness_command` and `[dispatch.carriers] git_inbox_command`, read at call time. */
async function handoffCommands(
  context: ApiContext,
): Promise<{ liveness: string[]; gitInbox: string[] }> {
  const file = await readUserConfig(context.dispatches.configEnv);
  const parsed = file.kind === "file" ? parseToml(file.text) : undefined;
  const root = parsed?.ok === true ? parsed.value : {};
  const handoff = isTable(root.handoff) ? root.handoff : {};
  const dispatch = isTable(root.dispatch) ? root.dispatch : {};
  const carriers = isTable(dispatch.carriers) ? dispatch.carriers : {};
  return {
    liveness: argvOf(handoff.liveness_command) ?? [...DEFAULT_LIVENESS_COMMAND],
    gitInbox: argvOf(carriers.git_inbox_command) ?? [...DEFAULT_GIT_INBOX_COMMAND],
  };
}

const address = (target: DispatchTarget) => `${target.session}@${target.host}`;

/**
 * The holder's liveness by the fleet's check: live only for a session-scoped `live` reading of
 * that exact identity, gone only for its `gone`; anything else, the tool failing included, is
 * unknown, and an unknown holder is never reassigned.
 */
export async function holderLiveness(
  command: readonly string[],
  holder: DispatchTarget,
): Promise<Liveness> {
  const identity = address(holder);
  const source = `${command.join(" ")} status --session ${identity}`;
  const result = await run([...command, "status", "--json", "--session", identity]);
  if (result.kind !== "exited" || result.exitCode !== 0) {
    return { state: "unknown", source, reason: `the liveness check failed (${said(result)})` };
  }
  let rows: unknown;
  try {
    rows = (JSON.parse(result.stdout) as { identities?: unknown }).identities;
  } catch {
    return { state: "unknown", source, reason: "the liveness check printed no JSON" };
  }
  const row = Array.isArray(rows)
    ? (rows as Record<string, unknown>[]).find((one) => one?.identity === identity)
    : undefined;
  if (row === undefined)
    return { state: "unknown", source, reason: `no heartbeat names ${identity}` };
  if (row.liveness === "gone") {
    return {
      state: "gone",
      source,
      reason: typeof row.reason === "string" && row.reason !== "" ? row.reason : "gone",
    };
  }
  if (row.liveness === "live" && row.scope === "session") return { state: "live", source };
  return {
    state: "unknown",
    source,
    reason: `the reading is ${String(row.liveness)}${row.scope === "session" ? "" : ` (${String(row.scope)} scope)`}`,
  };
}

const serial = new Serial();
const keyOf = (repo: string, id: string) => `${repo}\u0000${id}`;

async function readHandoffs(context: ApiContext): Promise<Record<string, Handoff>> {
  try {
    const json = JSON.parse(
      await readFile(join(context.dispatches.stateDir, HANDOFFS_FILE), "utf8"),
    ) as {
      handoffs?: Record<string, Handoff>;
    };
    return json.handoffs ?? {};
  } catch {
    return {};
  }
}

async function writeHandoffs(
  context: ApiContext,
  handoffs: Record<string, Handoff>,
): Promise<void> {
  const dir = context.dispatches.stateDir;
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, HANDOFFS_FILE);
  const next = `${path}.${process.pid}.${Date.now()}.new`;
  await writeFile(next, `${JSON.stringify({ version: 1, handoffs }, null, 2)}\n`, { mode: 0o600 });
  await rename(next, path);
}

const remember = (context: ApiContext, handoff: Handoff) =>
  serial.run(async () => {
    const handoffs = await readHandoffs(context);
    handoffs[keyOf(handoff.task.repo, handoff.task.id)] = handoff;
    await writeHandoffs(context, handoffs);
  });

export interface ClaimedChange {
  store: OpenStore;
  issue: Issue;
  /** The receiver the user picked, by the slug bd records, and the host the registry has it on. */
  receiver: string;
  receiverMachine?: string;
}

/** The pointer a git-inbox handoff carries: which task, from whom, to whom; never a prompt. */
export const handoffPointer = (repo: string, id: string, holder: string, receiver: string) =>
  `beads-ui handoff of ${id} in ${repo} from ${holder}, which is not running, to ${receiver}`;

/** T-W2.2 for a claimed task: a handoff request, a git-inbox action, or nothing with a retry. */
export async function claimedOwnerChange(
  change: ClaimedChange,
  context: ApiContext,
): Promise<ApiReply> {
  const { store, issue } = change;
  const settings = await readDispatchSettings(context);
  const holder = await ownerOf(issue, context, settings);
  if (!holder.ok) {
    return failure({
      kind: "owner-unknown",
      source: "owner change",
      message: `owner state unknown: ${holder.reason}; nothing was written`,
      retry: true,
    });
  }
  const receiverHost = change.receiverMachine ?? settings.host;
  if (receiverHost === undefined) {
    return failure({
      kind: "invalid",
      source: "owner change",
      message: `${change.receiver} names no host and [dispatch] host is not set`,
    });
  }
  const receiver: DispatchTarget = { session: change.receiver, host: receiverHost };
  const commands = await handoffCommands(context);
  const liveness = await holderLiveness(commands.liveness, holder.value);
  const task = { repo: store.repository, id: issue.id };
  if (liveness.state === "unknown") {
    return failure({
      kind: "owner-unknown",
      source: liveness.source,
      message: `owner state unknown: ${liveness.reason}; ${issue.id} was not reassigned, retry once the liveness check can read ${address(holder.value)}`,
      retry: true,
    });
  }
  if (liveness.state === "live") {
    const written = await writeDispatch(context, {
      task,
      target: holder.value,
      kind: "handoff-request",
      body: JSON.stringify({
        version: 1,
        task,
        receiver: address(receiver),
        set_in_progress: true,
      }),
      armGoal: false,
      mirrorIn: store,
    });
    if (written.status !== 201) return written;
    const { dispatch } = written.body as { dispatch: DispatchSummaryBody };
    await remember(context, {
      task,
      holder: holder.value,
      receiver,
      at: context.now(),
      mode: "request",
      dispatch: dispatch.id,
    });
    return {
      status: 202,
      body: {
        id: issue.id,
        handoff: {
          state: `handoff pending to ${change.receiver}`,
          source: liveness.source,
          dispatch,
        },
      },
    };
  }
  // Proved gone: bd's force path, then a pointer to the receiver. bd takes --force with the status
  // guard but not the assignee guard, so the holder is read again just before the write.
  const again = await store.bd.show(issue.id);
  if (again.kind !== "ok") return bdFailure("bd show", again);
  if (again.value.assignee !== issue.assignee || again.value.status !== CLAIMED) {
    return failure({
      kind: "stale",
      source: "bd show",
      message: `${issue.id}'s claim changed while its holder's liveness was read; nothing was written`,
    });
  }
  const released = await store.bd.update(
    issue.id,
    { assignee: "", status: "open" },
    { ifStatus: CLAIMED, force: true },
  );
  if (released.kind !== "ok") return bdFailure("bd update --force", released);
  const sent = await run(
    [
      ...commands.gitInbox,
      "send",
      "--to",
      address(receiver),
      "--re",
      `beads-ui handoff ${issue.id}`,
      "--body",
      handoffPointer(store.repository, issue.id, address(holder.value), address(receiver)),
      "--action",
      `${issue.id}@${store.repository}`,
      "--json",
    ],
    store.path,
  );
  let message: string | undefined;
  if (sent.kind === "exited" && sent.exitCode === 0) {
    try {
      const id = (JSON.parse(sent.stdout) as { id?: unknown }).id;
      if (typeof id === "string" && id !== "") message = id;
    } catch {
      message = undefined;
    }
  }
  if (message === undefined) {
    return failure({
      kind: "failed",
      source: "git-inbox send",
      message: `${address(holder.value)} is not running and its claim on ${issue.id} was released, but the git-inbox action to ${address(receiver)} was not sent (${said(sent)})`,
    });
  }
  await remember(context, {
    task,
    holder: holder.value,
    receiver,
    at: context.now(),
    mode: "git-inbox",
    message,
  });
  return {
    status: 202,
    body: {
      id: issue.id,
      handoff: {
        state: "owner not running",
        source: `${liveness.source}: ${liveness.reason}`,
        message,
      },
    },
  };
}

/** A handoff's state now, each from the record that proves it. */
async function handoffState(
  handoff: Handoff,
  store: OpenStore | undefined,
  context: ApiContext,
): Promise<{ state: string; source: string; final: boolean }> {
  if (handoff.mode === "git-inbox") {
    if (handoff.confirmed !== undefined) {
      return {
        state: "taken",
        source: `git-inbox confirm ${handoff.message}: ${handoff.confirmed.detail}`,
        final: true,
      };
    }
    const commands = await handoffCommands(context);
    const status = await run([...commands.gitInbox, "status", handoff.message ?? "", "--json"]);
    const row =
      status.kind === "exited" && status.exitCode === 0
        ? (() => {
            try {
              const rows = (
                JSON.parse(status.stdout) as {
                  recipients?: { recipient?: string; state?: string }[];
                }
              ).recipients;
              return rows?.find((one) => one.recipient === address(handoff.receiver));
            } catch {
              return undefined;
            }
          })()
        : undefined;
    if (row?.state === "taken" || row?.state === "confirmed") {
      const confirm = await run(
        [...commands.gitInbox, "confirm", handoff.message ?? "", "--json"],
        store?.path,
      );
      if (row.state === "confirmed" || (confirm.kind === "exited" && confirm.exitCode === 0)) {
        handoff.confirmed = {
          at: context.now(),
          detail: row.state === "confirmed" ? "confirmed" : said(confirm),
        };
        await remember(context, handoff);
        return { state: "taken", source: `git-inbox confirm ${handoff.message}`, final: true };
      }
    }
    return {
      state: "owner not running",
      source: `git-inbox status ${handoff.message}${row?.state === undefined ? "" : `: ${row.state}`}`,
      final: false,
    };
  }
  const dispatch = await context.dispatches.store.get(handoff.dispatch ?? "");
  const last = dispatch?.receipts.at(-1);
  if (dispatch?.state === "acted" && last !== undefined) {
    return {
      state: "handoff complete",
      source: `${last.source} at ${last.at}${last.reason === undefined ? "" : `: ${last.reason}`}`,
      final: true,
    };
  }
  if (dispatch?.state === "failed" || dispatch?.state === "expired") {
    return {
      state: `handoff ${dispatch.state}${last?.reason === undefined ? "" : `: ${last.reason}`}`,
      source: last === undefined ? "dispatch expiry" : `${last.source} at ${last.at}`,
      final: true,
    };
  }
  const taken = dispatch?.notes.filter((note) => note.text.startsWith("taken")).at(-1);
  if (taken !== undefined)
    return {
      state: "taken",
      source: `${taken.source} at ${taken.at}: ${taken.text}`,
      final: false,
    };
  const sentNote = dispatch?.notes.filter((note) => note.text.startsWith("sent")).at(-1);
  if (sentNote !== undefined) {
    return {
      state: "handoff sent",
      source: `${sentNote.source} at ${sentNote.at}: ${sentNote.text}`,
      final: false,
    };
  }
  const read = store === undefined ? undefined : await store.bd.show(handoff.task.id);
  if (read?.kind === "ok" && read.value.assignee === handoff.receiver.session) {
    return {
      state: "handoff sent",
      source: `the published store: bd show ${handoff.task.id} names ${handoff.receiver.session}, read ${context.now()}`,
      final: false,
    };
  }
  return {
    state: `handoff pending to ${handoff.receiver.session}`,
    source:
      dispatch === undefined
        ? "the handoff record"
        : `dispatch ${dispatch.record.id}: ${dispatch.state}`,
    final: false,
  };
}

/** `GET /api/handoff?store=&id=`: the task's handoff, if the server started one. */
export async function handoffRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const repo = request.query.get("store") ?? "";
  const id = request.query.get("id") ?? "";
  const handoff = (await readHandoffs(context))[keyOf(repo, id)];
  if (handoff === undefined) {
    return failure({
      kind: "not-found",
      source: "handoff",
      message: `no handoff of ${id} was started here`,
    });
  }
  const open = await context.stores.open();
  const store = open.find((one) => one.repository === repo);
  const state = await handoffState(handoff, store, context);
  return {
    status: 200,
    body: {
      id,
      store: repo,
      holder: handoff.holder,
      receiver: handoff.receiver,
      mode: handoff.mode,
      ...state,
    },
  };
}
