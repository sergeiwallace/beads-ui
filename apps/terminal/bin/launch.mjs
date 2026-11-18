#!/usr/bin/env node
// A detached split runs a direct argument vector. It never selects a pane or types into one.
import { parseArgs } from "node:util";
import { launchCompanion } from "./companion-lifecycle.mjs";

try {
  const { values } = parseArgs({
    options: {
      pane: { type: "string" },
      repo: { type: "string" },
      session: { type: "string" },
      socket: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });
  if (
    !values.pane ||
    !/^%\d+$/.test(values.pane) ||
    !values.repo ||
    !values.session ||
    /\s/.test(values.session)
  ) {
    throw new Error("explicit --pane %N, --repo and --session required");
  }
  if (values.socket && !/^[A-Za-z0-9_-]+$/.test(values.socket))
    throw new Error("invalid tmux socket name");
  process.stdout.write(`${await launchCompanion(values)}\n`);
} catch {
  // Child process diagnostics may contain local context. Do not echo command strings or values.
  process.stderr.write(
    "Could not launch detached Beads companion; verify pane, repo, session, tmux and Linux flock/timeout.\n",
  );
  process.exitCode = 2;
}
