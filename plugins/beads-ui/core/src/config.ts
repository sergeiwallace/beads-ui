import { DEFAULT_ID_POLICY, type IdPolicy, parseIdPolicy } from "./mint.ts";
import type { Result } from "./model.ts";
import { windowMs } from "./snapshot.ts";
import {
  DEFAULT_QUIET_SECONDS,
  DEFAULT_SYNC_TIMEOUT_SECONDS,
  MAX_SYNC_TIMEOUT_SECONDS,
  STORE_TOKEN,
  type SyncSettings,
} from "./sync.ts";
import {
  BAND_PARTS,
  type BandPart,
  type BandSettings,
  DEFAULT_BAND_SETTINGS,
  isBandPart,
} from "./views/band.ts";
import {
  COLLAPSE_RULES,
  DEFAULT_PANEL_SETTINGS,
  isCollapseRule,
  isPanelMode,
  isShownCount,
  MAX_SHOWN,
  PANEL_MODES,
  type PanelSettings,
} from "./views/panel.ts";
import { isSurfaceSetting, SURFACE_SETTINGS, type SurfaceSetting } from "./views/surfaces.ts";

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

export type TomlValue = string | number | boolean | string[] | TomlTable;
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
  typeof value === "object" && value !== null && !Array.isArray(value);

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
  if (s.startsWith("[")) {
    const items: string[] = [];
    let rest = s.slice(1).trimStart();
    for (;;) {
      if (rest.startsWith("]")) return [items, rest.slice(1)];
      if (!rest.startsWith('"') && !rest.startsWith("'")) {
        throw new TomlInvalid("arrays hold strings only, on one line");
      }
      const [item, after] = readValue(rest);
      if (typeof item !== "string") throw new TomlInvalid("arrays hold strings only, on one line");
      items.push(item);
      rest = after.trimStart();
      if (rest.startsWith(",")) rest = rest.slice(1).trimStart();
      else if (!rest.startsWith("]")) throw new TomlInvalid("expected , or ] in an array");
    }
  }
  const token = /^[^\s,}]+/.exec(s)?.[0] ?? "";
  const rest = s.slice(token.length);
  if (token === "true") return [true, rest];
  if (token === "false") return [false, rest];
  if (INTEGER.test(token) || FLOAT.test(token)) return [Number(token.replace(/_/g, "")), rest];
  throw new TomlInvalid(`unsupported value ${JSON.stringify(token)}`);
}

/**
 * The TOML subset `beads-ui.toml` uses: `[table]` and `[dotted.table]` headers, `key = value`
 * with bare keys or quoted keys without escapes, basic and literal strings, integers, floats, booleans,
 * one-line arrays of strings, and flat inline tables.
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

const joinPath = (dir: string, name: string) => `${dir.replace(/\/+$/, "")}/${name}`;

/**
 * The user's `beads-ui.toml`: `$XDG_CONFIG_HOME/beads-ui/beads-ui.toml`, else
 * `$HOME/.config/beads-ui/beads-ui.toml`; undefined with neither. `[sync]` is read from this
 * file alone, so a repository's own file can never name a command the mod runs.
 */
export function userConfigPath(env: {
  xdgConfigHome?: string | undefined;
  home?: string | undefined;
}): string | undefined {
  const configHome =
    env.xdgConfigHome !== undefined && env.xdgConfigHome !== ""
      ? env.xdgConfigHome
      : env.home !== undefined && env.home !== ""
        ? joinPath(env.home, ".config")
        : undefined;
  return configHome === undefined
    ? undefined
    : joinPath(joinPath(configHome, "beads-ui"), CONFIG_FILE_NAME);
}

/**
 * Where the mod looks for `beads-ui.toml`, in order; the first file that exists is used. The
 * repository root first, then the user's file (userConfigPath).
 */
export function configCandidates(
  repoRoot: string,
  env: { xdgConfigHome?: string | undefined; home?: string | undefined },
): string[] {
  const user = userConfigPath(env);
  const candidates = [joinPath(repoRoot, CONFIG_FILE_NAME)];
  if (user !== undefined) candidates.push(user);
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

/** The `beads-ui.toml` table of the band's settings (T-1B.5, T-1B.11). */
export const BAND_TABLE = "band";

export interface ResolvedBand {
  settings: BandSettings;
  /** One line per band setting the file got wrong; the default stands for each. */
  problems: string[];
}

function partsOf(value: unknown, problems: string[], where: string): BandPart[] | undefined {
  if (!Array.isArray(value)) {
    problems.push(`${where} must be a list of parts such as ["total", "open"]; using the default`);
    return undefined;
  }
  const parts: BandPart[] = [];
  for (const item of value) {
    if (typeof item === "string" && isBandPart(item)) {
      if (!parts.includes(item)) parts.push(item);
    } else {
      problems.push(
        `${where}: ${JSON.stringify(item)} is not one of ${BAND_PARTS.join(", ")}; ignored`,
      );
    }
  }
  return parts;
}

function windowOf(value: unknown, problems: string[], where: string): string | undefined {
  if (typeof value === "string" && windowMs(value) !== undefined) return value.trim();
  problems.push(
    `${where} ${JSON.stringify(value)} is not a window such as 24h, 90m, 7d or 2w; using the default`,
  );
  return undefined;
}

/** The band's settings from `[band]`: `done_window`, `parts` and `debug`, read at call time. */
export function resolveBand(text: string | undefined): ResolvedBand {
  const settings: BandSettings = {
    ...DEFAULT_BAND_SETTINGS,
    parts: [...DEFAULT_BAND_SETTINGS.parts],
  };
  const problems: string[] = [];
  if (text === undefined) return { settings, problems };
  const parsed = parseToml(text);
  if (!parsed.ok) return { settings, problems };
  const band = parsed.value[BAND_TABLE];
  if (band === undefined) return { settings, problems };
  if (!isTable(band)) {
    problems.push(`${BAND_TABLE} must be a table; using the band's defaults`);
    return { settings, problems };
  }
  if (band.done_window !== undefined) {
    const span = windowOf(band.done_window, problems, "band.done_window");
    if (span !== undefined) settings.doneWindow = span;
  }
  if (band.parts !== undefined) {
    const parts = partsOf(band.parts, problems, "band.parts");
    if (parts !== undefined) settings.parts = parts;
  }
  if (band.debug !== undefined) {
    if (typeof band.debug === "boolean") settings.debug = band.debug;
    else problems.push("band.debug must be true or false; using false");
  }
  return { settings, problems };
}

/** The band settings the pane changed, kept in `$.store` until Save to file writes them. */
export interface BandOverrides {
  doneWindow?: string;
  parts?: BandPart[];
  debug?: boolean;
}

/** Reads the pane's stored band settings, dropping anything malformed. */
export function bandOverridesOf(value: unknown): BandOverrides {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const overrides: BandOverrides = {};
  const ignored: string[] = [];
  if (record.doneWindow !== undefined) {
    const span = windowOf(record.doneWindow, ignored, "doneWindow");
    if (span !== undefined) overrides.doneWindow = span;
  }
  if (record.parts !== undefined) {
    const parts = partsOf(record.parts, ignored, "parts");
    if (parts !== undefined) overrides.parts = parts;
  }
  if (typeof record.debug === "boolean") overrides.debug = record.debug;
  return overrides;
}

export const withOverrides = (settings: BandSettings, overrides: BandOverrides): BandSettings => ({
  ...settings,
  ...(overrides.doneWindow === undefined ? {} : { doneWindow: overrides.doneWindow }),
  ...(overrides.parts === undefined ? {} : { parts: [...overrides.parts] }),
  ...(overrides.debug === undefined ? {} : { debug: overrides.debug }),
});

const HEADER = /^\s*\[([^\]]*)\]\s*(?:#.*)?$/;

/**
 * `text` with its `[name]` table replaced by `lines` (appended when it has none), every other
 * line kept as written; a file that does not exist yet (`undefined`) becomes the table alone.
 */
function withTable(text: string | undefined, name: string, lines: readonly string[]): string {
  const table = [`[${name}]`, ...lines];
  if (text === undefined || text.trim() === "") return `${table.join("\n")}\n`;
  const all = text.replace(/\n$/, "").split("\n");
  const start = all.findIndex((line) => HEADER.exec(line)?.[1]?.trim() === name);
  if (start === -1) return `${[...all, "", ...table].join("\n")}\n`;
  let end = start + 1;
  while (end < all.length && !HEADER.test(all[end] ?? "")) end++;
  // Blank lines before the next table stay where they were.
  while (end > start + 1 && (all[end - 1] ?? "").trim() === "") end--;
  return `${[...all.slice(0, start), ...table, ...all.slice(end)].join("\n")}\n`;
}

/** `text` with its `[band]` table replaced by `settings`, every other line kept as written. */
export function withBandTable(text: string | undefined, settings: BandSettings): string {
  return withTable(text, BAND_TABLE, [
    `done_window = ${JSON.stringify(settings.doneWindow)}`,
    `parts = [${settings.parts.map((part) => JSON.stringify(part)).join(", ")}]`,
    `debug = ${settings.debug ? "true" : "false"}`,
  ]);
}

/** The `beads-ui.toml` table of the task panel's settings (T-2B.2, T-2B.8). */
export const PANEL_TABLE = "panel";

export interface ResolvedPanel {
  settings: PanelSettings;
  /** One line per panel setting the file got wrong; the default stands for each. */
  problems: string[];
}

/**
 * The task panel's settings from `[panel]`: `shown`, `collapse`, `mode` and `open_at_start`,
 * read at call time.
 */
export function resolvePanel(text: string | undefined): ResolvedPanel {
  const settings: PanelSettings = { ...DEFAULT_PANEL_SETTINGS };
  const problems: string[] = [];
  if (text === undefined) return { settings, problems };
  const parsed = parseToml(text);
  if (!parsed.ok) return { settings, problems };
  const panel = parsed.value[PANEL_TABLE];
  if (panel === undefined) return { settings, problems };
  if (!isTable(panel)) {
    problems.push(`${PANEL_TABLE} must be a table; using the panel's defaults`);
    return { settings, problems };
  }
  if (panel.shown !== undefined) {
    if (isShownCount(panel.shown)) settings.shown = panel.shown;
    else
      problems.push(
        `panel.shown must be a whole number from 1 to ${MAX_SHOWN}; using ${DEFAULT_PANEL_SETTINGS.shown}`,
      );
  }
  if (panel.collapse !== undefined) {
    if (isCollapseRule(panel.collapse)) settings.collapse = panel.collapse;
    else
      problems.push(
        `panel.collapse ${JSON.stringify(panel.collapse)} is not one of ${COLLAPSE_RULES.join(", ")}; using ${DEFAULT_PANEL_SETTINGS.collapse}`,
      );
  }
  if (panel.mode !== undefined) {
    if (isPanelMode(panel.mode)) settings.mode = panel.mode;
    else
      problems.push(
        `panel.mode ${JSON.stringify(panel.mode)} is not one of ${PANEL_MODES.join(", ")}; using ${DEFAULT_PANEL_SETTINGS.mode}`,
      );
  }
  if (panel.open_at_start !== undefined) {
    if (typeof panel.open_at_start === "boolean") settings.openAtStart = panel.open_at_start;
    else
      problems.push(
        `panel.open_at_start must be true or false; using ${DEFAULT_PANEL_SETTINGS.openAtStart}`,
      );
  }
  return { settings, problems };
}

/** `text` with its `[panel]` table replaced by `settings`, every other line kept as written. */
export function withPanelTable(text: string | undefined, settings: PanelSettings): string {
  return withTable(text, PANEL_TABLE, [
    `shown = ${settings.shown}`,
    `collapse = ${JSON.stringify(settings.collapse)}`,
    `mode = ${JSON.stringify(settings.mode)}`,
    `open_at_start = ${settings.openAtStart}`,
  ]);
}

/** The `beads-ui.toml` table naming the surfaces each view draws on (D-35, T-2C.1). */
export const SURFACES_TABLE = "surfaces";

export interface ResolvedSurfaces {
  /** One setting per view the table names; a view it does not name draws on both. */
  settings: Record<string, SurfaceSetting>;
  /** One line per entry the file got wrong; that view draws on both. */
  problems: string[];
}

/**
 * `[surfaces]`, read at call time: one key per view id, `both`, `band` or `pane`. A key naming
 * no view the registry holds is kept, so a view registered later reads it too.
 */
export function resolveSurfaces(text: string | undefined): ResolvedSurfaces {
  const settings: Record<string, SurfaceSetting> = {};
  const problems: string[] = [];
  if (text === undefined) return { settings, problems };
  const parsed = parseToml(text);
  if (!parsed.ok) return { settings, problems };
  const table = parsed.value[SURFACES_TABLE];
  if (table === undefined) return { settings, problems };
  if (!isTable(table)) {
    problems.push(`${SURFACES_TABLE} must be a table; every view draws on both surfaces`);
    return { settings, problems };
  }
  for (const [view, value] of Object.entries(table)) {
    if (isSurfaceSetting(value)) settings[view] = value;
    else
      problems.push(
        `surfaces.${view} ${JSON.stringify(value)} is not one of ${SURFACE_SETTINGS.join(", ")}; using both`,
      );
  }
  return { settings, problems };
}

/**
 * `text` with its `[surfaces]` table replaced by `settings`, every other line kept as written;
 * with no setting and no table in the file, `text` as it was.
 */
export function withSurfacesTable(
  text: string,
  settings: Readonly<Record<string, SurfaceSetting>>,
): string {
  const entries = Object.entries(settings);
  const has = text.split("\n").some((line) => HEADER.exec(line)?.[1]?.trim() === SURFACES_TABLE);
  if (entries.length === 0 && !has) return text;
  return withTable(
    text,
    SURFACES_TABLE,
    entries.map(([view, setting]) => `${view} = ${JSON.stringify(setting)}`),
  );
}

/** The `beads-ui.toml` table of the publish run after an edit (D-33, T-2B.6). */
export const SYNC_TABLE = "sync";

export interface ResolvedSync {
  /** Undefined when `sync.command` is unset or empty: nothing publishes. */
  settings: SyncSettings | undefined;
  /** One line per sync setting the file got wrong. */
  problems: string[];
}

const wholeSeconds = (value: unknown, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max;

/**
 * The publish settings from `[sync]`, read at call time: `command`, an argument list whose
 * `{store}` is the written store's directory; `quiet_seconds` (default 10), the quiet after the
 * last write; `timeout_seconds` (default 300, at most 600). An unset or empty command, or one
 * that is not a list of strings, publishes nothing.
 */
export function resolveSync(text: string | undefined): ResolvedSync {
  const problems: string[] = [];
  if (text === undefined) return { settings: undefined, problems };
  const parsed = parseToml(text);
  if (!parsed.ok) return { settings: undefined, problems };
  const sync = parsed.value[SYNC_TABLE];
  if (sync === undefined) return { settings: undefined, problems };
  if (!isTable(sync)) {
    problems.push(`${SYNC_TABLE} must be a table; nothing is published`);
    return { settings: undefined, problems };
  }
  const command = sync.command;
  if (command === undefined) return { settings: undefined, problems };
  if (!Array.isArray(command)) {
    problems.push(
      `sync.command must be a list of arguments such as ["publish", "--repo", "${STORE_TOKEN}"]; nothing is published`,
    );
    return { settings: undefined, problems };
  }
  if (command.length === 0 || (command[0] ?? "").trim() === "") {
    return { settings: undefined, problems };
  }
  const settings: SyncSettings = {
    command: [...command],
    quietSeconds: DEFAULT_QUIET_SECONDS,
    timeoutSeconds: DEFAULT_SYNC_TIMEOUT_SECONDS,
  };
  if (sync.quiet_seconds !== undefined) {
    if (wholeSeconds(sync.quiet_seconds, Number.MAX_SAFE_INTEGER)) {
      settings.quietSeconds = sync.quiet_seconds;
    } else {
      problems.push(
        `sync.quiet_seconds must be a whole number of seconds from 1; using ${DEFAULT_QUIET_SECONDS}`,
      );
    }
  }
  if (sync.timeout_seconds !== undefined) {
    if (wholeSeconds(sync.timeout_seconds, MAX_SYNC_TIMEOUT_SECONDS)) {
      settings.timeoutSeconds = sync.timeout_seconds;
    } else {
      problems.push(
        `sync.timeout_seconds must be a whole number of seconds from 1 to ${MAX_SYNC_TIMEOUT_SECONDS}; using ${DEFAULT_SYNC_TIMEOUT_SECONDS}`,
      );
    }
  }
  return { settings, problems };
}
