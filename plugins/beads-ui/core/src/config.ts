import { DEFAULT_ID_POLICY, type IdPolicy, parseIdPolicy } from "./mint.ts";
import type { Result } from "./model.ts";

/** The settings the mod reads from `beads-ui.toml` (design, Configuration), at call time. */
export interface BeadsUiConfig {
  idPolicy: IdPolicy;
  refreshSeconds: number;
  softWipLimit: Readonly<Record<string, number>>;
}

export const CONFIG_FILE_NAME = "beads-ui.toml";

/** The band and the pane refresh at most this often (T-1.6), whatever the file says. */
export const MIN_REFRESH_SECONDS = 10;

export const DEFAULT_CONFIG: BeadsUiConfig = {
  idPolicy: DEFAULT_ID_POLICY,
  refreshSeconds: 10,
  softWipLimit: { in_progress: 5 },
};

export type TomlValue = string | number | boolean | TomlTable;
export interface TomlTable {
  [key: string]: TomlValue;
}

export interface TomlError {
  kind: "toml-error";
  line: number;
  message: string;
}

const BARE_KEY = /^[A-Za-z0-9_-]+$/;
// A quoted key with no escapes and no `=` inside, such as a directory name holding a dot.
const QUOTED_KEY = /^"([^"\\=]+)"$|^'([^'=]+)'$/;
const INTEGER = /^[+-]?(?:0|[1-9](?:_?[0-9])*)$/;
const FLOAT = /^[+-]?(?:0|[1-9](?:_?[0-9])*)\.[0-9](?:_?[0-9])*$/;

class TomlInvalid {
  constructor(readonly message: string) {}
}

const isTable = (value: TomlValue | undefined): value is TomlTable =>
  typeof value === "object" && value !== null;

// Removes a `#` comment that is not inside a string.
function withoutComment(line: string): string {
  let quote: string | undefined;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote === undefined) {
      if (ch === "#") return line.slice(0, i);
      if (ch === '"' || ch === "'") quote = ch;
    } else if (quote === '"' && ch === "\\") {
      i++;
    } else if (ch === quote) {
      quote = undefined;
    }
  }
  return line;
}

const ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  "\\": "\\",
  n: "\n",
  t: "\t",
  r: "\r",
};

// Reads one value from the start of `text`; returns it and what follows.
function readValue(text: string): [TomlValue, string] {
  const s = text.trimStart();
  if (s.startsWith('"')) {
    let out = "";
    for (let i = 1; i < s.length; i++) {
      const ch = s[i] ?? "";
      if (ch === '"') return [out, s.slice(i + 1)];
      if (ch === "\\") {
        const escaped = ESCAPES[s[i + 1] ?? ""];
        if (escaped === undefined) throw new TomlInvalid(`unsupported escape \\${s[i + 1] ?? ""}`);
        out += escaped;
        i++;
      } else {
        out += ch;
      }
    }
    throw new TomlInvalid("unterminated string");
  }
  if (s.startsWith("'")) {
    const end = s.indexOf("'", 1);
    if (end === -1) throw new TomlInvalid("unterminated string");
    return [s.slice(1, end), s.slice(end + 1)];
  }
  if (s.startsWith("{")) {
    const table: TomlTable = {};
    let rest = s.slice(1).trimStart();
    if (rest.startsWith("}")) return [table, rest.slice(1)];
    for (;;) {
      const eq = rest.indexOf("=");
      if (eq === -1) throw new TomlInvalid("expected key = value in an inline table");
      const key = rest.slice(0, eq).trim();
      if (!BARE_KEY.test(key)) throw new TomlInvalid(`invalid key ${JSON.stringify(key)}`);
      if (key in table) throw new TomlInvalid(`duplicate key ${key}`);
      const [value, after] = readValue(rest.slice(eq + 1));
      if (isTable(value)) throw new TomlInvalid("nested inline tables are not supported");
      table[key] = value;
      rest = after.trimStart();
      if (rest.startsWith(",")) {
        rest = rest.slice(1).trimStart();
        continue;
      }
      if (rest.startsWith("}")) return [table, rest.slice(1)];
      throw new TomlInvalid("expected , or } in an inline table");
    }
  }
  if (s.startsWith("[")) throw new TomlInvalid("arrays are not supported");
  const token = /^[^\s,}]+/.exec(s)?.[0] ?? "";
  const rest = s.slice(token.length);
  if (token === "true") return [true, rest];
  if (token === "false") return [false, rest];
  if (INTEGER.test(token) || FLOAT.test(token)) return [Number(token.replace(/_/g, "")), rest];
  throw new TomlInvalid(`unsupported value ${JSON.stringify(token)}`);
}

/**
 * The TOML subset `beads-ui.toml` uses: `[table]` and `[dotted.table]` headers, `key = value`
 * with bare keys or quoted keys without escapes, basic and literal strings, integers, floats, booleans, and flat inline tables.
 * Anything else is an error naming the line, never a guess.
 */
export function parseToml(text: string): Result<TomlTable, TomlError> {
  const root: TomlTable = {};
  let current = root;
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = withoutComment(lines[index] ?? "").trim();
    const fail = (message: string) => ({
      ok: false as const,
      error: { kind: "toml-error" as const, line: index + 1, message },
    });
    if (line === "") continue;
    try {
      if (line.startsWith("[")) {
        if (line.startsWith("[[")) return fail("arrays of tables are not supported");
        if (!line.endsWith("]")) return fail("expected ] to end the table header");
        const path = line
          .slice(1, -1)
          .split(".")
          .map((part) => part.trim());
        if (path.some((part) => !BARE_KEY.test(part))) return fail("invalid table name");
        current = root;
        for (const part of path) {
          const next = current[part];
          if (next === undefined) {
            const table: TomlTable = {};
            current[part] = table;
            current = table;
          } else if (isTable(next)) {
            current = next;
          } else {
            return fail(`${part} is already a value, not a table`);
          }
        }
        continue;
      }
      const eq = line.indexOf("=");
      if (eq === -1) return fail("expected key = value");
      const written = line.slice(0, eq).trim();
      const quoted = QUOTED_KEY.exec(written);
      const key = quoted?.[1] ?? quoted?.[2] ?? written;
      if (key === written && !BARE_KEY.test(key)) {
        return fail(`invalid key ${JSON.stringify(key)}`);
      }
      if (key in current) return fail(`duplicate key ${key}`);
      const [value, rest] = readValue(line.slice(eq + 1));
      if (rest.trim() !== "") return fail(`unexpected text after the value: ${rest.trim()}`);
      current[key] = value;
    } catch (error) {
      if (error instanceof TomlInvalid) return fail(error.message);
      throw error;
    }
  }
  return { ok: true, value: root };
}

/**
 * Where the mod looks for `beads-ui.toml`, in order; the first file that exists is used. The
 * repository root first, then the user's config directory (`$XDG_CONFIG_HOME/beads-ui`, else
 * `$HOME/.config/beads-ui`).
 */
export function configCandidates(
  repoRoot: string,
  env: { xdgConfigHome?: string | undefined; home?: string | undefined },
): string[] {
  const join = (dir: string, name: string) => `${dir.replace(/\/+$/, "")}/${name}`;
  const candidates = [join(repoRoot, CONFIG_FILE_NAME)];
  const configHome =
    env.xdgConfigHome !== undefined && env.xdgConfigHome !== ""
      ? env.xdgConfigHome
      : env.home !== undefined && env.home !== ""
        ? join(env.home, ".config")
        : undefined;
  if (configHome !== undefined)
    candidates.push(join(join(configHome, "beads-ui"), CONFIG_FILE_NAME));
  return candidates;
}

export interface ResolvedConfig {
  config: BeadsUiConfig;
  /** One line per setting the file got wrong; the default stands for each. */
  problems: string[];
}

const samePath = (a: string, b: string) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

/**
 * The settings for the store at `storePath`: `[stores.<name>]` whose `path` is that store, else
 * `[stores.default]`, then `[views]`. No file (`text` undefined) gives the defaults.
 */
export function resolveConfig(text: string | undefined, storePath: string): ResolvedConfig {
  if (text === undefined) return { config: DEFAULT_CONFIG, problems: [] };
  const parsed = parseToml(text);
  if (!parsed.ok) {
    return {
      config: DEFAULT_CONFIG,
      problems: [
        `${CONFIG_FILE_NAME} line ${parsed.error.line}: ${parsed.error.message}; using the defaults`,
      ],
    };
  }
  const problems: string[] = [];
  const config: BeadsUiConfig = { ...DEFAULT_CONFIG };
  const stores = parsed.value.stores;
  const storeTables = isTable(stores) ? Object.values(stores).filter(isTable) : [];
  const store =
    storeTables.find(
      (table) => typeof table.path === "string" && samePath(table.path, storePath),
    ) ?? (isTable(stores) && isTable(stores.default) ? stores.default : undefined);

  if (store?.id_policy !== undefined) {
    const policy = typeof store.id_policy === "string" ? parseIdPolicy(store.id_policy) : undefined;
    if (policy?.ok === true) config.idPolicy = policy.value;
    else
      problems.push(
        `id_policy ${JSON.stringify(store.id_policy)} is not one of auto, fleet-slug, off; using ${DEFAULT_CONFIG.idPolicy}`,
      );
  }
  if (store?.refresh_seconds !== undefined) {
    const seconds = store.refresh_seconds;
    if (typeof seconds !== "number" || !Number.isInteger(seconds) || seconds < 1) {
      problems.push(
        `refresh_seconds must be a whole number of seconds; using ${DEFAULT_CONFIG.refreshSeconds}`,
      );
    } else if (seconds < MIN_REFRESH_SECONDS) {
      config.refreshSeconds = MIN_REFRESH_SECONDS;
      problems.push(
        `refresh_seconds ${seconds} is below ${MIN_REFRESH_SECONDS}; using ${MIN_REFRESH_SECONDS}`,
      );
    } else {
      config.refreshSeconds = seconds;
    }
  }
  const views = parsed.value.views;
  const limits = isTable(views) ? views.soft_wip_limit : undefined;
  if (limits !== undefined) {
    if (!isTable(limits)) {
      problems.push("soft_wip_limit must be an inline table such as { in_progress = 5 }");
    } else {
      const softWipLimit: Record<string, number> = {};
      for (const [status, limit] of Object.entries(limits)) {
        if (typeof limit === "number" && Number.isInteger(limit) && limit >= 0) {
          softWipLimit[status] = limit;
        } else {
          problems.push(`soft_wip_limit.${status} must be a whole number; ignored`);
        }
      }
      config.softWipLimit = softWipLimit;
    }
  }
  return { config, problems };
}
