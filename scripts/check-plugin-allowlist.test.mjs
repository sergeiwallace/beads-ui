import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const plugin = resolve(import.meta.dirname, "../plugins/beads-ui");
const allowlist = resolve(plugin, "validate-allowlist.json");
const TS5097 =
  "error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.";
const notes = Object.entries(JSON.parse(readFileSync(allowlist, "utf8")).modules).flatMap(
  ([module, kinds]) =>
    Object.entries(kinds).map(
      ([kind, values]) => `${module} ${kind}: ${values.length ? values.join(", ") : "nothing"}`,
    ),
);
const currentHooks =
  "./register.ts hooks: session.start, command.run{command=show-beads-ui|bu}, turn.complete, ui.close{id=beads|beads-confirm}, ui.fault{requestId=beads}, ui.focus{requestId=beads} (default matcher key: plugin, component), ui.message{requestId=beads}, ui.render{component=AbovePrompt} (default matcher key: plugin), ui.render{component=Pane} (default matcher key: plugin)";
const currentNotes = notes.map((note) =>
  note.startsWith("./register.ts hooks:") ? currentHooks : note,
);

let runs = 0;
function allowlistWithWarnings(t, messages) {
  const dir = mkdtempSync(join(tmpdir(), "allowlist-"));
  t.after(() => rmSync(dir, { recursive: true }));
  const path = join(dir, "validate-allowlist.json");
  const real = JSON.parse(readFileSync(allowlist, "utf8"));
  const warnings = messages.map((message) => ({ message, reason: "a fixture's reason" }));
  writeFileSync(path, JSON.stringify({ ...real, warnings }));
  return path;
}

async function runGate(
  t,
  {
    warnings = [],
    errors = [],
    success = warnings.length === 0 && errors.length === 0,
    allowedWarnings = [],
    extraNotes = [],
    reportedNotes = notes,
    before = [],
  } = {},
) {
  const gateAllowlist = allowedWarnings.length
    ? allowlistWithWarnings(t, allowedWarnings)
    : allowlist;
  const report = {
    success,
    contents: [
      {
        type: "hooks",
        notes: [...reportedNotes, ...extraNotes],
        warnings: warnings.map((message) => ({ message })),
        errors: errors.map((message) => ({ message })),
      },
    ],
  };
  const lines = [];
  const stopped = new Error("gate exited");
  let status = 0;
  const argv = process.argv;
  const queued = [...before];
  let calls = 0;
  t.mock.method(childProcess, "spawnSync", (command, args) => {
    assert.equal(command, "claude");
    assert.deepEqual(args, ["plugin", "validate", "--strict", "--json", plugin]);
    calls++;
    const next = queued.shift() ?? report;
    return { status: next.success ? 0 : 1, stdout: JSON.stringify(next), stderr: "" };
  });
  t.mock.method(console, "log", (line) => lines.push(line));
  const pauses = [];
  t.mock.method(Atomics, "wait", (_array, _index, _value, ms) => {
    pauses.push(ms);
    return "timed-out";
  });
  t.mock.method(process, "exit", (code) => {
    status = code;
    throw stopped;
  });
  syncBuiltinESMExports();
  process.argv = [process.execPath, "check-plugin-allowlist.mjs", plugin, gateAllowlist];
  try {
    await import(`./check-plugin-allowlist.mjs?regression=${runs++}`);
  } catch (error) {
    if (error !== stopped) throw error;
  } finally {
    process.argv = argv;
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
  return { status, output: lines.join("\n"), calls, pauses };
}

const NO_ANSWER = "not type-checked: the check ended without an answer";
const unanswered = {
  success: false,
  contents: [{ type: "hooks", notes, warnings: [{ message: NO_ANSWER }], errors: [] }],
};

test("should pass the real footprint when validate reports no warning", async (t) => {
  const result = await runGate(t);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /matches .*validate-allowlist.json/);
});

test("should reject TS5097 on the real allow-list", async (t) => {
  const result = await runGate(t, { warnings: [TS5097] });
  assert.equal(result.status, 1);
  assert.ok(result.output.includes(`validate warning: ${TS5097}`), result.output);
});

test("should pass when the only warning is one the allow-list names with a reason", async (t) => {
  const result = await runGate(t, { warnings: [TS5097], allowedWarnings: [TS5097] });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /matches .*validate-allowlist.json/);
});

test("should reject an additional type warning beside an allowed warning", async (t) => {
  const warning = "error TS2345: a required input field is missing";
  const result = await runGate(t, { warnings: [TS5097, warning], allowedWarnings: [TS5097] });
  assert.equal(result.status, 1);
  assert.ok(result.output.includes(warning), result.output);
});

test("should reject a different message from the same warning class", async (t) => {
  const warning = TS5097.replace("'.ts'", "'.tsx'");
  const result = await runGate(t, { warnings: [warning], allowedWarnings: [TS5097] });
  assert.equal(result.status, 1);
  assert.ok(result.output.includes(warning), result.output);
});

test("should reject errors even when their message is an allowed warning", async (t) => {
  const result = await runGate(t, { errors: [TS5097], allowedWarnings: [TS5097] });
  assert.equal(result.status, 1);
  assert.ok(result.output.includes(`validate error: ${TS5097}`), result.output);
});

test("should reject a new engine call", async (t) => {
  const result = await runGate(t, { extraNotes: ["./register.ts calls: $.store.delete"] });
  assert.equal(result.status, 1);
  assert.match(result.output, /\$\.store.delete is not in the allow-list/);
});

test("should reject unexplained validator failure", async (t) => {
  const result = await runGate(t, { success: false });
  assert.equal(result.status, 1);
  assert.match(result.output, /claude plugin validate reported failure/);
});

test("should pass the current validator's default matcher annotations from the hook log", async (t) => {
  const result = await runGate(t, { reportedNotes: currentNotes });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /matches .*validate-allowlist.json/);
});

test("should reject an added hook after a comma-bearing default matcher annotation", async (t) => {
  const result = await runGate(t, {
    reportedNotes: currentNotes.map((note) =>
      note === currentHooks ? `${note}, tool.call (default matcher key: plugin)` : note,
    ),
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /hooks: tool.call is not in the allow-list/);
});

test("should reject a missing hook in the current validator format", async (t) => {
  const result = await runGate(t, {
    reportedNotes: currentNotes.map((note) =>
      note.replace(", ui.render{component=Pane} (default matcher key: plugin)", ""),
    ),
  });
  assert.equal(result.status, 1);
  assert.match(
    result.output,
    /hooks: ui.render\{component=Pane\} is allow-listed but not reported/,
  );
});

test("should preserve commas and parentheses inside a matcher and still split hooks", async (t) => {
  const hook = "ui.render{component=Other(foo, bar), surface=terminal}";
  const result = await runGate(t, {
    extraNotes: [`./register.ts hooks: ${hook} (default matcher key: plugin), tool.call`],
  });
  assert.equal(result.status, 1);
  assert.ok(result.output.includes(`hooks: ${hook} is not in the allow-list`), result.output);
  assert.match(result.output, /hooks: tool.call is not in the allow-list/);
});

test("should reject an unknown hook annotation rather than dropping it", async (t) => {
  const hook = "ui.focus{requestId=beads} (unknown annotation: plugin, component)";
  const result = await runGate(t, { extraNotes: [`./register.ts hooks: ${hook}`] });
  assert.equal(result.status, 1);
  assert.ok(result.output.includes(`hooks: ${hook} is not in the allow-list`), result.output);
});

test("should run validate again when its type check ended without an answer, and use the answer", async (t) => {
  const result = await runGate(t, { before: [unanswered] });
  assert.equal(result.status, 0, result.output);
  assert.equal(result.calls, 2);
  assert.deepEqual(result.pauses, [10_000]);
  assert.match(result.output, /matches .*validate-allowlist.json/);
});

test("should exit 2 without claiming a difference when no validate attempt answers", async (t) => {
  const result = await runGate(t, { before: [unanswered, unanswered, unanswered] });
  assert.equal(result.status, 2, result.output);
  assert.equal(result.calls, 3);
  assert.deepEqual(result.pauses, [10_000, 20_000]);
  assert.match(result.output, /type check ended without an answer on all 3 attempts/);
  assert.doesNotMatch(result.output, /differs from/);
});
