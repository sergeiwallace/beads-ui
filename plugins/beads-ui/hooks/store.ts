import {
  type BandStore,
  type BdWhere,
  configCandidates,
  directoryStores,
  parseBdWhere,
  parseStoreInventory,
  type Result,
  resolveStore,
  STORE_INVENTORY_FILE,
  type StoreResolution,
  userConfigPath,
  whereArgv,
} from "../core/src/index.js";
import type { Host, SessionEnv } from "./host.js";

const WHERE_TIMEOUT_MS = 8_000;

/** One resolution and the files it read, so the pane and the band read each once per refresh. */
export interface Resolved {
  resolution: StoreResolution;
  /** The config file found first, as the pane's settings read it. */
  config: { path: string | undefined; text: string | undefined };
  inventory: Result<BandStore[], string>;
  /** What the config file's `[directory_stores]` table got wrong. */
  problems: string[];
}

const blank = (value: string | undefined) =>
  value === undefined || value.trim() === "" ? undefined : value.trim();

/**
 * The session's name, the assignee of the beads it owns (D-17). `ai c` pins it in
 * `CLAUDE_CODE_TASK_LIST_ID`. A session Claude Code's daemon hosts (moved to the background, or
 * reached by `claude attach`) runs in a worker whose environment is the daemon's, so that
 * variable there names whichever session started the daemon, often the firstmate; the worker's
 * own session is the name Claude Code sets in `CLAUDE_CODE_SESSION_NAME`, less the ` (N)` Claude
 * Code adds when an older copy already holds the bare name. A worker with no such name has none
 * this session can prove, so it counts as unnamed and never takes the firstmate's form.
 */
function sessionNameOf(env: SessionEnv): string | undefined {
  return blank(isHosted(env) ? env.name?.replace(/ \(\d+\)$/, "") : env.taskListId);
}

const isHosted = (env: SessionEnv) => env.kind === "bg" || env.backend === "daemon";

/**
 * The name Claude Code recorded for this session, for one `ai c` did not start (a typed
 * `claude -r <name>`, or `claude -n <name>`), which has no `CLAUDE_CODE_TASK_LIST_ID`. Claude
 * Code keeps one record a process in `<config>/sessions/<pid>.json`, holding the session's id and
 * the name it goes by; the transcript `$.session.info` names is `<session id>.jsonl`. Only a name
 * the person gave (`nameSource` `user`) is the session's: an `auto` or `collision` name owns no
 * beads. A session id no record holds, or two records naming it differently, leaves the session
 * unnamed, as before.
 */
async function recordedNameOf(host: Host, sessionsDir: string): Promise<string | undefined> {
  const transcript = await host.transcriptPath().catch(() => undefined);
  const id = transcript
    ?.split(/[\\/]/)
    .pop()
    ?.replace(/\.jsonl$/, "");
  if (id === undefined || id === "") return undefined;
  const entries = await host.listDir(sessionsDir).catch((): string[] => []);
  const names = new Set<string>();
  for (const entry of entries.filter((name) => name.endsWith(".json"))) {
    const text = await host.readFile(`${sessionsDir}/${entry}`).catch(() => undefined);
    const record = recordOf(text);
    const name = blank(record?.name);
    if (record?.sessionId === id && record.nameSource === "user" && name !== undefined) {
      names.add(name);
    }
  }
  return names.size === 1 ? [...names][0] : undefined;
}

interface SessionRecord {
  sessionId?: unknown;
  name?: string;
  nameSource?: unknown;
}

function recordOf(text: string | undefined): SessionRecord | undefined {
  if (text === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null) return undefined;
    const { sessionId, name, nameSource } = value as Record<string, unknown>;
    return { sessionId, nameSource, ...(typeof name === "string" ? { name } : {}) };
  } catch {
    return undefined;
  }
}

const sessionsHome = (home: string | undefined) =>
  home === undefined ? undefined : `${home.replace(/[\\/]+$/, "")}/.claude`;

/**
 * The store the session's pane and band read (D-24), worked out by core's resolveStore from the
 * config file and the store inventory, both read on every call, and from one `bd where` in the
 * session's directory, asked once a session: a directory does not gain or lose a store while a
 * session runs in it, and bd's own answer covers worktrees and `BEADS_DIR`.
 */
export class StoreResolver {
  private host: Host | undefined;
  private session: string | undefined;
  private env: { xdgConfigHome?: string; home?: string } = {};
  private where: Promise<BdWhere | undefined> | undefined;

  async bind(host: Host): Promise<void> {
    this.host = host;
    this.where = undefined;
    const { xdgConfigHome, home } = await host
      .configEnv()
      .catch(() => ({ xdgConfigHome: undefined, home: undefined }));
    const xdg = blank(xdgConfigHome);
    const dir = blank(home);
    this.env = {
      ...(xdg === undefined ? {} : { xdgConfigHome: xdg }),
      ...(dir === undefined ? {} : { home: dir }),
    };
    const env = await host.sessionEnv().catch(() => undefined);
    this.session = env === undefined ? undefined : sessionNameOf(env);
    if (this.session !== undefined || env === undefined || isHosted(env)) return;
    const config = blank(env.configDir) ?? sessionsHome(dir ?? blank(env.userProfile));
    if (config !== undefined) this.session = await recordedNameOf(host, `${config}/sessions`);
  }

  /** The session's name (sessionNameOf). */
  get sessionName(): string | undefined {
    return this.session;
  }

  /** `HOME`, where the store inventory and the user's config and state directories live. */
  get home(): string | undefined {
    return this.env.home;
  }

  get xdgConfigHome(): string | undefined {
    return this.env.xdgConfigHome;
  }

  async resolve(): Promise<Resolved> {
    const host = this.host;
    if (host === undefined) {
      return {
        resolution: { ok: false, tried: ["the session has not started"], fix: [] },
        config: { path: undefined, text: undefined },
        inventory: { ok: false, error: "the session has not started" },
        problems: [],
      };
    }
    const checked = configCandidates(host.cwd, this.env);
    let config: Resolved["config"] = { path: undefined, text: undefined };
    for (const path of checked) {
      const text = await host.readFile(path).catch(() => undefined);
      if (text !== undefined) {
        config = { path, text };
        break;
      }
    }
    const inventoryPath =
      this.env.home === undefined
        ? undefined
        : `${this.env.home.replace(/\/+$/, "")}/${STORE_INVENTORY_FILE}`;
    const inventory = await this.inventory(inventoryPath);
    const where = await this.whereCwd();
    const resolution = resolveStore({
      cwd: host.cwd,
      config: { ...config, checked },
      fixFile: checked[checked.length - 1] ?? checked[0] ?? "",
      home: this.env.home,
      cwdHasStore: where?.hasStore,
      cwdPrefix: where?.prefix,
      session: this.session,
      inventory,
      inventoryPath,
    });
    const { problems } = directoryStores(config.text, this.env.home);
    return { resolution, config, inventory, problems };
  }

  /**
   * The user's own `beads-ui.toml` (userConfigPath), never the repository's: the file `[sync]`
   * is read from, so a checkout cannot name a command the mod runs.
   */
  async userConfigText(): Promise<string | undefined> {
    const host = this.host;
    const path = userConfigPath(this.env);
    if (host === undefined || path === undefined) return undefined;
    return host.readFile(path).catch(() => undefined);
  }

  private async inventory(path: string | undefined): Promise<Result<BandStore[], string>> {
    const host = this.host;
    if (host === undefined || path === undefined) {
      return { ok: false, error: "no home directory to find the store inventory in" };
    }
    const text = await host.readFile(path).catch(() => undefined);
    if (text === undefined) return { ok: false, error: `no store inventory at ${path}` };
    return parseStoreInventory(text);
  }

  private whereCwd(): Promise<BdWhere | undefined> {
    const host = this.host;
    if (host === undefined) return Promise.resolve(undefined);
    if (this.where === undefined) {
      const asked = host
        .run(whereArgv(), WHERE_TIMEOUT_MS)
        .then(
          (ran) => parseBdWhere(ran.exitCode, ran.stdout),
          () => undefined,
        )
        .then((answer) => {
          if (answer === undefined && this.where === asked) this.where = undefined;
          return answer;
        });
      this.where = asked;
    }
    return this.where;
  }
}
