// A held item's detail (web app design T-W1.7): its whole Markdown body from the held store's
// `show`, and its option cards from the structured-options command (D-2) when it prints any. The
// commands are `[review] command`'s program from the user's own beads-ui.toml, run without a shell.

import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import {
  heldBase,
  type ItemOptions,
  optionsForItem,
  parseDecisionOptions,
  parseReviewOutput,
  REVIEW_TIMEOUT_MS,
  type ReviewItem,
  reviewArgv,
  showItemArgv,
} from "@beads-ui/core";
import { type ApiContext, type ApiReply, type ApiRequest, failure, invalid } from "./routes.ts";

/** One held command's run: its exit code (null for a timeout or a signal) and its output. */
export interface HeldRun {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** Why it did not run or finish, when it did not. */
  why?: string;
}

/** Runs one held command as an argument list; never rejects for a failure of the command. */
export function runHeld(argv: readonly string[], cwd: string): Promise<HeldRun> {
  const [bin, ...args] = argv;
  if (bin === undefined)
    return Promise.resolve({ exitCode: null, stdout: "", stderr: "", why: "no command" });
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      { cwd, timeout: REVIEW_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ exitCode: 0, stdout, stderr });
          return;
        }
        if (typeof error.code === "number") {
          resolve({ exitCode: error.code, stdout, stderr });
          return;
        }
        const why = error.killed
          ? `did not finish within ${REVIEW_TIMEOUT_MS} ms`
          : `could not run: ${String(error.code ?? error.message)}`;
        resolve({ exitCode: null, stdout, stderr, why });
      },
    );
  });
}

/** The structured-options command for one item (`held_cli.py options <path>`). */
export const optionsArgv = (command: readonly string[], path: string): string[] => [
  ...heldBase(command),
  "options",
  path,
];

const firstLine = (text: string) => text.trim().split("\n")[0] ?? "";

const refusal = (name: string, run: HeldRun): string =>
  run.why !== undefined
    ? `${name} ${run.why}`
    : `${name} exited ${run.exitCode}${firstLine(run.stderr) === "" ? "" : `: ${firstLine(run.stderr)}`}`;

const trimmed = (path: string) => path.replace(/\/+$/, "");

async function real(path: string): Promise<string> {
  try {
    return trimmed(await realpath(path));
  } catch {
    return trimmed(path);
  }
}

/** A read of the detail that failed, named by the command and the store it read. */
export interface HeldReadError {
  source: string;
  store?: string;
  exitCode: number | null;
  message: string;
}

/**
 * `GET /api/held/item?path=<item path>`: the item as `review` lists it, its body, and its option
 * cards. The item must be one `review` lists in a store open on this host (its allowlist); a body
 * or options read that fails is named with its command, store and exit code, never drawn empty.
 */
export async function heldItemRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const path = request.query.get("path") ?? "";
  if (path === "" || path.startsWith("-")) {
    return invalid(
      "a held item's detail needs `path`, the item's path as the review command prints it",
    );
  }
  const config = await context.config();
  const command = config.reviewCommand;
  if (command === undefined) {
    return failure({
      kind: "not-found",
      source: "[review] command",
      message: "held items are not read: set [review] command in your own beads-ui.toml",
    });
  }
  const cwd = context.repoRoot;
  const listed = await runHeld(reviewArgv(command), cwd);
  if (listed.exitCode !== 0) {
    return failure({
      kind: "failed",
      source: "held review",
      exitCode: listed.exitCode,
      message: refusal("the review command", listed),
    });
  }
  const output = parseReviewOutput(listed.stdout);
  if (!output.ok || output.value.unchanged) {
    return failure({
      kind: "failed",
      source: "held review",
      exitCode: 0,
      message: output.ok ? "the review command printed no items" : output.error,
    });
  }
  const item: ReviewItem | undefined = output.value.items.find((one) => one.path === path);
  if (item === undefined) {
    return failure({
      kind: "not-found",
      source: "held review",
      message: `${path} is not a held item the review command lists on this host`,
    });
  }
  const open = await context.stores.open();
  const itemStore = await real(item.store);
  const owning = [];
  for (const store of open) if ((await real(store.path)) === itemStore) owning.push(store);
  const [store] = owning;
  if (store === undefined) {
    return failure({
      kind: "forbidden",
      source: "[hosts] allow_repos",
      message: `${path} is in a store this host's allowlist does not open`,
    });
  }

  const shown = await runHeld(showItemArgv(command, path), cwd);
  let body: string | undefined;
  let bodyError: HeldReadError | undefined;
  if (shown.exitCode === 0) {
    try {
      const json = JSON.parse(shown.stdout) as { body?: unknown };
      if (typeof json.body === "string") body = json.body;
    } catch {
      // Named below as a body that could not be read.
    }
  }
  if (body === undefined) {
    bodyError = {
      source: "held show",
      store: store.repository,
      exitCode: shown.exitCode,
      message:
        shown.exitCode === 0
          ? "the show command printed no body"
          : refusal("the show command", shown),
    };
  }

  const ran = await runHeld(optionsArgv(command, path), cwd);
  let options: ItemOptions | undefined;
  let optionsError: HeldReadError | undefined;
  if (ran.exitCode === 0) {
    const parsed = parseDecisionOptions(ran.stdout);
    if (parsed.ok) options = optionsForItem(parsed.value, path);
    else {
      optionsError = {
        source: "held options",
        store: store.repository,
        exitCode: 0,
        message: `${parsed.error.field} ${parsed.error.problem}`,
      };
    }
  } else {
    optionsError = {
      source: "held options",
      store: store.repository,
      exitCode: ran.exitCode,
      message: refusal("the options command", ran),
    };
  }

  return {
    status: 200,
    body: {
      item,
      store: store.repository,
      ...(body === undefined ? {} : { body }),
      ...(bodyError === undefined ? {} : { bodyError }),
      ...(options === undefined ? {} : { options }),
      ...(optionsError === undefined ? {} : { optionsError }),
    },
  };
}
