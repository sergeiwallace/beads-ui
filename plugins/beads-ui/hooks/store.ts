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
  whereArgv,
} from "../core/src/index.ts";
import type { Host, SessionEnv } from "./host.ts";

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
 * own session is the name Claude Code sets in `CLAUDE_CODE_SESSION_NAME`. A worker with no such
 * name has none this session can prove, so it counts as unnamed and never takes the firstmate's
 * form.
 */
function sessionNameOf(env: SessionEnv): string | undefined {
  const hosted = env.kind === "bg" || env.backend === "daemon";
  return blank(hosted ? env.name : env.taskListId);
}

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
    const env = await host.sessionEnv().catch(() => undefined);
    this.session = env === undefined ? undefined : sessionNameOf(env);
    const { xdgConfigHome, home } = await host
      .configEnv()
      .catch(() => ({ xdgConfigHome: undefined, home: undefined }));
    const xdg = blank(xdgConfigHome);
    const dir = blank(home);
    this.env = {
      ...(xdg === undefined ? {} : { xdgConfigHome: xdg }),
      ...(dir === undefined ? {} : { home: dir }),
    };
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
          // bd did not say: ask again on the next refresh rather than keep a non-answer.
          if (answer === undefined && this.where === asked) this.where = undefined;
          return answer;
        });
      this.where = asked;
    }
    return this.where;
  }
}
