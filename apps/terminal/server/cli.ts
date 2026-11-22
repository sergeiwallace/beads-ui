/** Terminal host for the shared board. No automatic pane selection or composer input. */

import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs, stripVTControlCharacters } from "node:util";
import { boardView } from "@beads-ui/core";
import { createBdClient } from "../../../packages/bd-node/src/index.ts";
import { monitorCompanion } from "./companion-lifecycle.ts";
import { SessionBoard } from "./session-board.ts";

function text(value: string): string {
  return stripVTControlCharacters(value).replace(/\p{Cc}/gu, " ");
}

function cardId(card: { id: string; displayId: string }): string {
  const id = text(card.id);
  const label = text(card.displayId);
  return card.id === card.displayId ? id : `${label} [${id}]`;
}

function draw(board: SessionBoard): string {
  const view = boardView(board.state, {
    columnWidth: Math.max(20, (process.stdout.columns ?? 80) - 8),
  });
  const lines = [`Beads: ${text(board.session)}`];
  if (view.loading) lines.push("Loading tasks");
  for (const message of [view.errorLine, view.conflictLine, view.filterLine]) {
    if (message) lines.push(text(message));
  }
  for (let index = 0; index < view.columns.length; index++) {
    const column = view.columns[index];
    if (!column) continue;
    lines.push(`${text(column.label)} (${column.count})`);
    for (const lane of view.lanes) {
      for (const card of lane.cells[index] ?? []) {
        lines.push(
          `  ${cardId(card)} ${text(card.priority)} ${text(card.title)}${card.pending ? " [pending]" : ""}`,
        );
      }
    }
  }
  for (const card of view.unplaced)
    lines.push(`  ${cardId(card)} ${text(card.title)} [unknown status]`);
  return `${lines.join("\n")}\n`;
}

export async function main(argv: string[]): Promise<number> {
  let args: { repo: string; session: string; once: boolean; lifecycle?: string };
  try {
    const values = parseArgs({
      args: argv,
      options: {
        repo: { type: "string" },
        session: { type: "string" },
        lifecycle: { type: "string" },
        once: { type: "boolean", default: false },
      },
      strict: true,
      allowPositionals: false,
    }).values;
    if (!values.repo || !values.session) throw new Error("--repo and --session are required");
    args = { repo: values.repo, session: values.session, once: values.once };
    if (values.lifecycle) args.lifecycle = values.lifecycle;
    if (!args.once && (!process.stdin.isTTY || !process.stdout.isTTY)) {
      throw new Error("interactive mode requires a terminal; use --once for a snapshot");
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? text(error.message) : "Invalid arguments"}\n`);
    return 2;
  }
  let stopMonitor: (() => void) | undefined;
  try {
    if (args.lifecycle) stopMonitor = await monitorCompanion(args.lifecycle);
  } catch {
    process.stderr.write("Could not establish companion lifecycle identity\n");
    return 2;
  }
  let board: SessionBoard;
  try {
    board = new SessionBoard(
      createBdClient({
        cwd: resolve(args.repo),
        env: { ...process.env, BEADS_ACTOR: args.session },
      }),
      args.session,
    );
  } catch (error) {
    stopMonitor?.();
    process.stderr.write(`${error instanceof Error ? text(error.message) : "Invalid session"}\n`);
    return 2;
  }
  await board.refresh(new Date().toISOString());
  process.stdout.write(draw(board));
  if (args.once) {
    stopMonitor?.();
    return board.state.loadError ? 1 : 0;
  }

  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  terminal.setPrompt("beads> ");
  let serial = Promise.resolve();
  const refresh = () => {
    serial = serial.then(async () => {
      await board.refresh(new Date().toISOString());
      process.stdout.write(`\x1b[2J\x1b[H${draw(board)}`);
      terminal.prompt(true);
    });
  };
  const timer = setInterval(refresh, 30_000);
  process.stdout.write(
    "refresh | move <issue-id> <status> | quit. Select this pane manually to interact.\n",
  );
  terminal.prompt();
  try {
    for await (const line of terminal) {
      if (line.trim() === "quit" || line.trim() === "q") break;
      await serial;
      const words = line.trim().split(/\s+/);
      try {
        if (words[0] === "move" && words.length === 3) {
          await board.move(words[1] ?? "", words[2] ?? "");
        } else if (line.trim() !== "refresh") {
          throw new Error("Use refresh, move <issue-id> <status>, or quit");
        }
      } catch (error) {
        process.stdout.write(
          `${error instanceof Error ? text(error.message) : "Command failed"}\n`,
        );
      }
      process.stdout.write(draw(board));
      if (line.trim() === "refresh") refresh();
      else terminal.prompt();
    }
  } finally {
    clearInterval(timer);
    stopMonitor?.();
    terminal.close();
    await serial;
  }
  return 0;
}
