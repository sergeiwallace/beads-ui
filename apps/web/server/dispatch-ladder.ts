// The dispatch ladder (web app design D-6, D-7, D-10, § Composer and dispatch, T-W2.1, T-W2.3):
// how a written dispatch reaches its session. Dispatches to one session written within the
// coalescing window go as one event; past the hourly cap, or while the session's goal is paused
// for a limit, they wait. An event is carried by Agent Mail, then Buzz, then git-inbox, the first
// that takes it; with automatic wakes on and no shown receipt in time, the prompt-injection
// pointer, then the mod's submit; and every dispatch keeps the turn-end pickup as its floor. Every
// policy and every tool is read at call time, and each rung's attempt is recorded on the dispatch.

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ActiveRungName,
  type CarrierName,
  type DispatchPointer,
  type DispatchRecord,
  type DispatchStore,
  type DispatchTarget,
  dispatchPointer,
  type GoalReport,
  goalHold,
  HOUR_MS,
  isOutstanding,
  type LadderEntry,
  parseGoalReport,
  parseToml,
  parseWakePolicy,
  planDelivery,
  type RungName,
  rateCheck,
  resolveDispatchPolicy,
  type StoredDispatch,
  type TomlTable,
  type TomlValue,
  type WakePolicy,
} from "@beads-ui/core";
import { type ConfigEnv, readUserConfig } from "./config.ts";
import { Serial } from "./dispatch-store/common.ts";

/** Where the ladder keeps its rate log, its holds and the goal states receivers report. */
export const LADDER_STATE_FILE = "dispatch-ladder.json";
/** How long one rung's tool may run. */
export const RUNG_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;

export interface RungResult {
  ok: boolean;
  /** What the tool said: `exit 0`, or why it failed (`exit 3: ...`, `cannot run: ENOENT`). */
  detail: string;
}

/** The tools each rung calls; the real fleet tools by default, as beads-ui.toml names them. */
export interface LadderTools {
  carry(
    carrier: CarrierName,
    target: DispatchTarget,
    pointer: DispatchPointer,
  ): Promise<RungResult>;
  local(
    rung: ActiveRungName,
    target: DispatchTarget,
    pointer: DispatchPointer,
    claim: string,
  ): Promise<RungResult>;
  wakePolicy(target: DispatchTarget): Promise<WakePolicy>;
}

const isTable = (value: TomlValue | undefined): value is TomlTable =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const argvOf = (value: TomlValue | undefined): string[] | undefined =>
  Array.isArray(value) && value.length > 0 && value.every((arg) => typeof arg === "string")
    ? (value as string[])
    : undefined;

/** The tool commands `[dispatch]`, `[dispatch.carriers]` and `[dispatch.local]` name. */
export interface LadderCommands {
  /** `[dispatch] host`: this host, whose wake policy file the server can read itself. */
  host?: string;
  carriers: Record<CarrierName, string[]>;
  local: Partial<Record<ActiveRungName, string[]>>;
  /** `[dispatch] wake_policy`: this host's wake policy file. */
  wakePolicyFile?: string;
  /** `[dispatch] wake_policy_command`: prints another host's wake policy, the host appended. */
  wakePolicyCommand?: string[];
}

export const DEFAULT_CARRIER_COMMANDS: Readonly<Record<CarrierName, readonly string[]>> = {
  "agent-mail": ["agent-mail-notifier"],
  buzz: ["buzz"],
  "git-inbox": ["git-inbox"],
};

const CARRIER_KEYS: Readonly<Record<CarrierName, string>> = {
  "agent-mail": "agent_mail_command",
  buzz: "buzz_command",
  "git-inbox": "git_inbox_command",
};
const LOCAL_KEYS: Readonly<Record<ActiveRungName, string>> = {
  "prompt-injection": "prompt_injection_command",
  "mod-submit": "mod_submit_command",
};

/** The idle wake's policy file on this host: `$XDG_CONFIG_HOME/ai-harness/idle-wake.json`. */
export function defaultWakePolicyFile(env: ConfigEnv): string | undefined {
  const base =
    env.xdgConfigHome ?? (env.home === undefined ? undefined : join(env.home, ".config"));
  return base === undefined ? undefined : join(base, "ai-harness", "idle-wake.json");
}

export function readLadderCommands(text: string | undefined, env: ConfigEnv): LadderCommands {
  const commands: LadderCommands = {
    carriers: {
      "agent-mail": [...DEFAULT_CARRIER_COMMANDS["agent-mail"]],
      buzz: [...DEFAULT_CARRIER_COMMANDS.buzz],
      "git-inbox": [...DEFAULT_CARRIER_COMMANDS["git-inbox"]],
    },
    local: {},
  };
  const fallback = defaultWakePolicyFile(env);
  if (fallback !== undefined) commands.wakePolicyFile = fallback;
  const parsed = text === undefined ? undefined : parseToml(text);
  const dispatch = parsed?.ok === true ? parsed.value.dispatch : undefined;
  if (!isTable(dispatch)) return commands;
  if (typeof dispatch.host === "string" && dispatch.host.trim() !== "") {
    commands.host = dispatch.host.trim();
  }
  if (typeof dispatch.wake_policy === "string" && dispatch.wake_policy !== "") {
    commands.wakePolicyFile = dispatch.wake_policy;
  }
  const wakeCommand = argvOf(dispatch.wake_policy_command);
  if (wakeCommand !== undefined) commands.wakePolicyCommand = wakeCommand;
  const carriers = isTable(dispatch.carriers) ? dispatch.carriers : {};
  for (const [carrier, key] of Object.entries(CARRIER_KEYS) as [CarrierName, string][]) {
    const argv = argvOf(carriers[key]);
    if (argv !== undefined) commands.carriers[carrier] = argv;
  }
  const local = isTable(dispatch.local) ? dispatch.local : {};
  for (const [rung, key] of Object.entries(LOCAL_KEYS) as [ActiveRungName, string][]) {
    const argv = argvOf(local[key]);
    if (argv !== undefined) commands.local[rung] = argv;
  }
  return commands;
}

type Run =
  | { kind: "exited"; exitCode: number; stdout: string; stderr: string }
  | { kind: "timeout" }
  | { kind: "unrunnable"; message: string };

function run(argv: readonly string[]): Promise<Run> {
  const [bin, ...args] = argv;
  if (bin === undefined) return Promise.resolve({ kind: "unrunnable", message: "no command" });
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      { encoding: "utf8", timeout: RUNG_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES },
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

const firstLine = (text: string): string => text.trim().split("\n")[0] ?? "";

function outcome(result: Run, sentCodes: readonly number[] = [0]): RungResult {
  if (result.kind === "timeout")
    return { ok: false, detail: `did not finish within ${RUNG_TIMEOUT_MS} ms` };
  if (result.kind === "unrunnable") return { ok: false, detail: `cannot run: ${result.message}` };
  const said = firstLine(result.stderr) || firstLine(result.stdout);
  const detail = `exit ${result.exitCode}${said === "" ? "" : `: ${said.slice(0, 300)}`}`;
  return { ok: sentCodes.includes(result.exitCode), detail };
}

const address = (target: DispatchTarget) => `${target.session}@${target.host}`;

/** The one line the prompt-injection library types and the mod submits: a pointer, never a body. */
export const pointerLine = (pointer: DispatchPointer): string =>
  `${pointer.subject}: fetch it through the receiver API and verify its envelope before acting.`;

/** Runs `argv` with `text` in a private file whose path follows `flag`; the file is removed after. */
async function withTextFile(text: string, use: (path: string) => Promise<Run>): Promise<Run> {
  const dir = await mkdtemp(join(tmpdir(), "beads-ui-rung-"));
  try {
    const path = join(dir, "pointer.txt");
    await writeFile(path, `${text}\n`, { mode: 0o600 });
    return await use(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * The real fleet tools, each with the argv its own CLI takes: `agent-mail-notifier send --to
 * <session>@<host> --subject --body`, `buzz send --to --dm-only --json <text>`, `git-inbox send
 * --to --re --body --json`; the prompt-injection library's `inject` with `--target session:<s>
 * --key <claim> --text-file`, where its exit 2 (queued) also counts as sent; and the mod's submit
 * with `--session --text-file`. The local rungs have no default command, so a host names them.
 */
export function commandTools(commands: LadderCommands): LadderTools {
  return {
    carry: async (carrier, target, pointer) => {
      const base = commands.carriers[carrier];
      const to = address(target);
      const argv =
        carrier === "agent-mail"
          ? [...base, "send", "--to", to, "--subject", pointer.subject, "--body", pointer.text]
          : carrier === "buzz"
            ? [
                ...base,
                "send",
                "--to",
                to,
                "--dm-only",
                "--json",
                `${pointer.subject}\n${pointer.text}`,
              ]
            : [
                ...base,
                "send",
                "--to",
                to,
                "--re",
                pointer.subject,
                "--body",
                pointer.text,
                "--json",
              ];
      return outcome(await run(argv));
    },
    local: async (rung, target, pointer, claim) => {
      const base = commands.local[rung];
      if (base === undefined) {
        return {
          ok: false,
          detail: `[dispatch.local] ${LOCAL_KEYS[rung]} is not set on this host`,
        };
      }
      if (commands.host === undefined || target.host !== commands.host) {
        return {
          ok: false,
          detail: `${target.host} is not this host, so its panes cannot be reached from here`,
        };
      }
      const line = pointerLine(pointer);
      if (rung === "prompt-injection") {
        const result = await withTextFile(line, (file) =>
          run([
            ...base,
            "--target",
            `session:${target.session}`,
            "--key",
            claim,
            "--text-file",
            file,
            "--json",
          ]),
        );
        return outcome(result, [0, 2]);
      }
      return outcome(
        await withTextFile(line, (file) =>
          run([...base, "--session", target.session, "--text-file", file]),
        ),
      );
    },
    wakePolicy: async (target) => {
      if (commands.host !== undefined && target.host === commands.host) {
        const path = commands.wakePolicyFile;
        if (path === undefined)
          return { state: "unreadable", reason: "no wake policy file is known on this host" };
        try {
          return parseWakePolicy(await readFile(path, "utf8"));
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code ?? String(error);
          return { state: "unreadable", reason: `the wake policy file cannot be read (${code})` };
        }
      }
      if (commands.wakePolicyCommand === undefined) {
        return {
          state: "unreadable",
          reason: `${target.host}'s wake policy cannot be read from here: set [dispatch] wake_policy_command`,
        };
      }
      const result = await run([...commands.wakePolicyCommand, target.host]);
      if (result.kind !== "exited" || result.exitCode !== 0) {
        return {
          state: "unreadable",
          reason: `wake_policy_command for ${target.host}: ${outcome(result).detail}`,
        };
      }
      return parseWakePolicy(result.stdout);
    },
  };
}

interface LadderState {
  version: 1;
  /** Per session, when each dispatch to it was sent (ms), for the hourly cap. */
  sent: Record<string, number[]>;
  /** Dispatches held by the ladder, and why: the hourly cap or a paused goal. */
  held: Record<string, "rate" | "goal">;
  /** The goal state each session last reported. */
  goals: Record<string, GoalReport>;
}

const emptyState = (): LadderState => ({ version: 1, sent: {}, held: {}, goals: {} });

export type Schedule = (ms: number, run: () => void) => () => void;

const realSchedule: Schedule = (ms, task) => {
  const timer = setTimeout(task, ms);
  timer.unref();
  return () => clearTimeout(timer);
};

export interface LadderOptions {
  store: () => DispatchStore;
  stateDir: string;
  configEnv: ConfigEnv;
  clock: () => number;
  schedule?: Schedule;
  /** The tools, from the commands beads-ui.toml names now; commandTools by default. */
  tools?: (commands: LadderCommands) => LadderTools;
}

export type DeliverNow = { ok: true } | { ok: false; reason: string };

export class DispatchLadder {
  readonly #options: LadderOptions;
  readonly #schedule: Schedule;
  readonly #serial = new Serial();
  readonly #pending = new Map<string, string[]>();
  readonly #timers = new Set<() => void>();
  readonly #work = new Set<Promise<unknown>>();
  #closed = false;

  constructor(options: LadderOptions) {
    this.#options = options;
    this.#schedule = options.schedule ?? realSchedule;
  }

  #now(): string {
    return new Date(this.#options.clock()).toISOString();
  }

  #track<T>(promise: Promise<T>): Promise<T> {
    this.#work.add(promise);
    promise.finally(() => this.#work.delete(promise)).catch(() => undefined);
    return promise;
  }

  /** Runs `task` in `ms`; until it has run, or close cancels it, idle() waits for it too. */
  #later(ms: number, task: () => Promise<unknown>): void {
    if (this.#closed) return;
    let settle: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const cancel = this.#schedule(ms, () => {
      this.#timers.delete(stop);
      task()
        .catch(() => undefined)
        .finally(settle);
    });
    const stop = () => {
      cancel();
      settle();
    };
    this.#timers.add(stop);
    void this.#track(done);
  }

  async #config(): Promise<string | undefined> {
    const file = await readUserConfig(this.#options.configEnv);
    return file.kind === "file" ? file.text : undefined;
  }

  async #tools(): Promise<{ text: string | undefined; tools: LadderTools }> {
    const text = await this.#config();
    const commands = readLadderCommands(text, this.#options.configEnv);
    return { text, tools: (this.#options.tools ?? commandTools)(commands) };
  }

  get #statePath(): string {
    return join(this.#options.stateDir, LADDER_STATE_FILE);
  }

  async #readState(): Promise<LadderState> {
    try {
      const json = JSON.parse(await readFile(this.#statePath, "utf8")) as Partial<LadderState>;
      return {
        version: 1,
        sent: json.sent ?? {},
        held: json.held ?? {},
        goals: json.goals ?? {},
      };
    } catch {
      return emptyState();
    }
  }

  async #writeState(state: LadderState): Promise<void> {
    await mkdir(this.#options.stateDir, { recursive: true, mode: 0o700 });
    const next = `${this.#statePath}.${process.pid}.${Date.now()}.new`;
    await writeFile(next, `${JSON.stringify(state)}\n`, { mode: 0o600 });
    await rename(next, this.#statePath);
  }

  #append(id: string, entry: LadderEntry): Promise<unknown> {
    return this.#options.store().annotate(id, entry);
  }

  #rung(
    id: string,
    rung: RungName,
    outcome: "sent" | "failed" | "skipped",
    detail: string,
    event?: readonly string[],
  ) {
    return this.#append(id, {
      op: "rung",
      id,
      at: this.#now(),
      rung,
      outcome,
      detail,
      ...(event === undefined ? {} : { event: [...event] }),
    });
  }

  /**
   * Takes a dispatch just written: held, or into its session's coalescing batch. It never throws:
   * a dispatch the ladder could not take is still stored and listed, so the turn-end pickup holds.
   */
  submit(record: DispatchRecord): Promise<void> {
    return this.#track(
      this.#serial.run(() => this.#admit(record.id, record.target, false)).catch(() => undefined),
    );
  }

  async #admit(id: string, target: DispatchTarget, now: boolean): Promise<void> {
    const key = address(target);
    const state = await this.#readState();
    const policy = resolveDispatchPolicy(await this.#config());
    if (!now) {
      const goal = goalHold(state.goals[key], this.#now());
      if (goal.held) {
        state.held[id] = "goal";
        await this.#writeState(state);
        await this.#append(id, {
          op: "delivery",
          id,
          at: this.#now(),
          to: "waiting",
          source: `goal state reported by ${key} at ${state.goals[key]?.at}`,
          reason: goal.reason,
          hold: true,
          ...(goal.until === undefined ? {} : { until: goal.until }),
        });
        return;
      }
      if (policy.ok) {
        const rate = rateCheck(
          state.sent[key] ?? [],
          this.#options.clock(),
          policy.policy.maxPerSessionPerHour,
        );
        if (rate.held) {
          state.held[id] = "rate";
          await this.#writeState(state);
          await this.#append(id, {
            op: "delivery",
            id,
            at: this.#now(),
            to: "waiting",
            source: "the ladder's hourly count of dispatches to this session",
            reason: rate.reason,
            hold: true,
            until: new Date(rate.releaseAt).toISOString(),
          });
          return;
        }
      }
    }
    state.sent[key] = [...(state.sent[key] ?? []), this.#options.clock()].filter(
      (at) => at > this.#options.clock() - HOUR_MS,
    );
    await this.#writeState(state);
    const window = now || !policy.ok ? 0 : policy.policy.coalesceWindowS * 1000;
    const batch = this.#pending.get(key);
    if (batch !== undefined) {
      batch.push(id);
      return;
    }
    this.#pending.set(key, [id]);
    if (window === 0) {
      this.#pending.delete(key);
      void this.#track(this.#deliver([id]));
      return;
    }
    this.#later(window, async () => {
      const ids = this.#pending.get(key) ?? [];
      this.#pending.delete(key);
      await this.#deliver(ids);
    });
  }

  /** The dispatches of `ids` still waiting for delivery, read back from the store. */
  async #open(ids: readonly string[]): Promise<StoredDispatch[]> {
    const store = this.#options.store();
    const read = await Promise.all(ids.map((id) => store.get(id)));
    return read.filter(
      (dispatch): dispatch is StoredDispatch =>
        dispatch !== undefined &&
        isOutstanding(dispatch) &&
        (dispatch.state === "queued" ||
          (dispatch.state === "waiting" && dispatch.hold === undefined)),
    );
  }

  /** Carries one event for `ids`, all to one session. */
  async #deliver(ids: readonly string[]): Promise<void> {
    const open = await this.#open(ids);
    const first = open[0];
    if (first === undefined) return;
    const target = first.record.target;
    const { text, tools } = await this.#tools();
    const policy = resolveDispatchPolicy(text);
    const plan = planDelivery(policy, await tools.wakePolicy(target));
    const each = (task: (id: string) => Promise<unknown>) =>
      Promise.all(open.map((dispatch) => task(dispatch.record.id)));
    if (plan.mode === "turn-end") {
      await each((id) => this.#rung(id, "turn-end", "sent", plan.reason));
      await each((id) =>
        this.#append(id, {
          op: "delivery",
          id,
          at: this.#now(),
          to: "waiting",
          source: "the dispatch ladder",
          reason: `turn-end pickup only: ${plan.reason}`,
        }),
      );
      return;
    }
    const pointer = dispatchPointer(open.map((dispatch) => dispatch.record));
    let carried = false;
    // The ids that go out together: a carrier may cut the subject, so a shown receipt for any
    // one of them stands for the whole event (shown below).
    const event = open.map((dispatch) => dispatch.record.id);
    for (const carrier of plan.carriers) {
      const result = await tools.carry(carrier, target, pointer);
      await each((id) =>
        result.ok
          ? this.#rung(id, carrier, "sent", result.detail, event)
          : this.#rung(id, carrier, "failed", result.detail),
      );
      if (result.ok) {
        carried = true;
        break;
      }
    }
    if (plan.mode === "passive") {
      await each((id) =>
        this.#rung(
          id,
          "turn-end",
          "sent",
          "automatic wakes are off: the notifier's passive header delivers it",
        ),
      );
      await each((id) =>
        this.#append(id, {
          op: "delivery",
          id,
          at: this.#now(),
          to: "waiting",
          source: "the target host's wake policy",
          reason: plan.waiting,
        }),
      );
      return;
    }
    const claim = `beads-ui-dispatch-${first.record.id}`;
    const fallback = () =>
      this.#fallback(
        open.map((dispatch) => dispatch.record.id),
        claim,
      );
    if (carried && policy.ok) this.#later(policy.policy.shownWithinS * 1000, fallback);
    else await fallback();
  }

  /** With nothing shown, the active rungs in order, then the turn-end floor with every failure. */
  async #fallback(ids: readonly string[], claim: string): Promise<void> {
    const open = (await this.#open(ids)).filter((dispatch) => dispatch.state === "queued");
    const first = open[0];
    if (first === undefined) return;
    const target = first.record.target;
    const { text, tools } = await this.#tools();
    const plan = planDelivery(resolveDispatchPolicy(text), await tools.wakePolicy(target));
    const each = (task: (id: string) => Promise<unknown>) =>
      Promise.all(open.map((dispatch) => task(dispatch.record.id)));
    if (plan.mode !== "active") {
      const why = plan.mode === "passive" ? "automatic wakes are now off" : plan.reason;
      await each((id) => this.#rung(id, "turn-end", "sent", why));
      return;
    }
    const pointer = dispatchPointer(open.map((dispatch) => dispatch.record));
    for (const rung of plan.local) {
      const result = await tools.local(rung, target, pointer, claim);
      await each((id) => this.#rung(id, rung, result.ok ? "sent" : "failed", result.detail));
      if (result.ok) return;
    }
    await each((id) => this.#rung(id, "turn-end", "sent", "every active rung failed"));
  }

  /** A shown receipt from the dispatch's own target: the notifier showed its header. */
  /**
   * A shown receipt from the dispatch's own target: the notifier showed the header of the event
   * that carried it. Every dispatch of that event is shown, each with this receipt as its source,
   * since a carrier may cut the subject to its first id; a receipt from anyone else changes
   * nothing.
   */
  shown(id: string, from: DispatchTarget): Promise<boolean> {
    return this.#track(
      (async () => {
        const store = this.#options.store();
        const dispatch = await store.get(id);
        if (dispatch === undefined || address(dispatch.record.target) !== address(from))
          return false;
        const carried = dispatch.rungs.filter(
          (rung) => rung.outcome === "sent" && rung.event !== undefined,
        );
        const event = carried.at(-1)?.event ?? [id];
        const source = `shown receipt from ${address(from)}`;
        const mark = (one: string) =>
          store.annotate(one, { op: "delivery", id: one, at: this.#now(), to: "shown", source });
        const result = await mark(id);
        for (const other of event) {
          if (other === id) continue;
          const sibling = await store.get(other);
          if (sibling === undefined || address(sibling.record.target) !== address(from)) continue;
          await mark(other);
        }
        return result.ok;
      })(),
    );
  }

  /** A session's goal report; a report of an active goal, or none, releases what waited on it. */
  reportGoal(target: DispatchTarget, body: unknown): Promise<string | undefined> {
    return this.#track(
      this.#serial.run(async () => {
        const report = parseGoalReport(body, this.#now());
        if (typeof report === "string") return report;
        const key = address(target);
        const state = await this.#readState();
        state.goals[key] = report;
        await this.#writeState(state);
        if (report.state !== "paused") {
          const source = `goal reported ${report.state} by ${key} at ${report.at}`;
          await this.#release(state, (_id, why) => (why === "goal" ? source : undefined), target);
        }
        return undefined;
      }),
    );
  }

  /** Releases the held dispatches `pick` selects, for `target` when given, into delivery. */
  async #release(
    state: LadderState,
    /** The source of the release, or undefined to keep the dispatch held. */
    pick: (id: string, why: "rate" | "goal", dispatch: StoredDispatch) => string | undefined,
    target?: DispatchTarget,
    now = false,
  ): Promise<void> {
    const store = this.#options.store();
    for (const [id, why] of Object.entries(state.held)) {
      const dispatch = await store.get(id);
      if (dispatch === undefined || dispatch.hold === undefined || !isOutstanding(dispatch)) {
        delete state.held[id];
        continue;
      }
      if (target !== undefined && address(dispatch.record.target) !== address(target)) continue;
      const source = pick(id, why, dispatch);
      if (source === undefined) continue;
      delete state.held[id];
      await this.#writeState(state);
      await this.#append(id, { op: "delivery", id, at: this.#now(), to: "queued", source });
      await this.#admit(id, dispatch.record.target, now);
    }
    await this.#writeState(state);
  }

  /** "Deliver now" on a dispatch waiting on a paused goal: released and carried at once. */
  deliverNow(id: string, by: string): Promise<DeliverNow> {
    return this.#track(
      this.#serial.run(async () => {
        const state = await this.#readState();
        if (state.held[id] !== "goal") {
          return { ok: false, reason: "this dispatch is not waiting on a paused goal" } as const;
        }
        await this.#release(
          state,
          (one) => (one === id ? `deliver now by ${by}` : undefined),
          undefined,
          true,
        );
        return { ok: true } as const;
      }),
    );
  }

  /** The periodic pass: releases holds whose pause window ended or whose hourly count fell. */
  sweep(): Promise<void> {
    return this.#track(
      this.#serial.run(async () => {
        const state = await this.#readState();
        if (Object.keys(state.held).length === 0) return;
        const now = this.#now();
        const policy = resolveDispatchPolicy(await this.#config());
        await this.#release(state, (_id, why, dispatch) => {
          const key = address(dispatch.record.target);
          if (why === "goal") {
            const until = dispatch.hold?.until;
            return goalHold(state.goals[key], now).held
              ? undefined
              : `the recorded pause window ended${until === undefined ? "" : ` at ${until}`}`;
          }
          const max = policy.ok ? policy.policy.maxPerSessionPerHour : undefined;
          if (
            max !== undefined &&
            rateCheck(state.sent[key] ?? [], this.#options.clock(), max).held
          ) {
            return undefined;
          }
          return "the hourly count of dispatches to this session fell below max_per_session_per_hour";
        });
      }),
    );
  }

  /** Resolves once nothing the ladder started is still running or scheduled. */
  async idle(): Promise<void> {
    while (this.#work.size > 0) await Promise.allSettled([...this.#work]);
  }

  close(): void {
    this.#closed = true;
    for (const cancel of this.#timers) cancel();
    this.#timers.clear();
  }
}
