import type { RenderElement, RenderNode } from "claude-code";

import {
  BAND_PART_LABELS,
  BAND_PARTS,
  type BandOverrides,
  type BandPart,
  type BandSettings,
  bandOverridesOf,
  configCandidates,
  glyphOf,
  resolveBand,
  type Token,
  windowMs,
  withBandTable,
  withOverrides,
} from "../core/src/index.ts";
import type { Host } from "./host.ts";
import type { PaneUi } from "./pane.ts";
import type { StoreResolver } from "./store.ts";

/** Where the pane keeps band settings changed in it until Save to file writes them. */
export const BAND_SETTINGS_KEY = "band-settings";

/**
 * The band's settings (T-1B.11): `beads-ui.toml`'s `[band]` table, read at call time, with the
 * changes made in the pane's band settings over it. A change applies at once in this session and
 * at the next minute in every other (`$.store` is the machine's), and Save to file writes the
 * result into the config file and clears the held changes, so later edits to the file show.
 */
export class BandSettingsPanel {
  host: Host | undefined;
  isOpen = false;
  overrides: BandOverrides = {};
  notice: { text: string; token: Token } | undefined;
  /** The band redraws with the new settings; register.ts wires it to the tally. */
  onChange: (() => void) | undefined;
  private problems: string[] = [];
  private shown: BandSettings | undefined;

  constructor(private readonly stores: StoreResolver) {}

  async bind(host: Host): Promise<void> {
    this.host = host;
    await this.reload();
  }

  private async reload(): Promise<void> {
    this.overrides = bandOverridesOf(
      await this.host?.storeGet(BAND_SETTINGS_KEY).catch(() => undefined),
    );
  }

  /** The settings the band draws with now: the file's, read from `text`, under the pane's. */
  async current(text: string | undefined): Promise<BandSettings> {
    await this.reload();
    const resolved = resolveBand(text);
    this.problems = resolved.problems;
    this.shown = withOverrides(resolved.settings, this.overrides);
    return this.shown;
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
    this.notice = undefined;
    this.host?.invalidate();
  }

  private async change(next: BandOverrides): Promise<void> {
    this.overrides = { ...this.overrides, ...next };
    this.notice = undefined;
    await this.host?.storeSet(BAND_SETTINGS_KEY, this.overrides).catch(() => undefined);
    this.onChange?.();
    this.host?.invalidate();
  }

  private partsNow(): BandPart[] {
    return [...(this.shown?.parts ?? [])];
  }

  /** Adds a part at the end of the band, or removes it. */
  async togglePart(part: BandPart): Promise<void> {
    const parts = this.partsNow();
    await this.change({
      parts: parts.includes(part) ? parts.filter((one) => one !== part) : [...parts, part],
    });
  }

  /** Moves a drawn part one place left (`-1`) or right (`1`) on the band. */
  async movePart(part: BandPart, delta: -1 | 1): Promise<void> {
    const parts = this.partsNow();
    const at = parts.indexOf(part);
    const to = at + delta;
    if (at === -1 || to < 0 || to >= parts.length) return;
    parts.splice(at, 1);
    parts.splice(to, 0, part);
    await this.change({ parts });
  }

  async setWindow(text: string): Promise<void> {
    const window = text.trim();
    if (windowMs(window) === undefined) {
      this.notice = {
        text: `${JSON.stringify(window)} is not a window such as 24h, 90m, 7d or 2w`,
        token: "error",
      };
      this.host?.invalidate();
      return;
    }
    await this.change({ doneWindow: window });
  }

  /** Debug mode (T-1B.5, T-2B.8): the band shows its read time. */
  async setDebug(on: boolean): Promise<void> {
    await this.change({ debug: on });
  }

  /** The band's settings as last drawn, before the band has drawn them the defaults. */
  get settings(): BandSettings | undefined {
    return this.shown;
  }

  /**
   * Save to file: writes the band's settings as they draw into the config file the mod reads
   * (the user's own when there is none yet), keeping every other line of it, then clears the
   * changes held in `$.store`. `also` rewrites the same text first, as the Settings view does to
   * save the panel's table in the same write; true when the file was written.
   */
  async save(also?: (text: string | undefined) => string): Promise<boolean> {
    const host = this.host;
    if (host === undefined) return false;
    const { config } = await this.stores.resolve();
    const settings = await this.current(config.text);
    const path =
      config.path ??
      configCandidates(host.cwd, {
        xdgConfigHome: this.stores.xdgConfigHome,
        home: this.stores.home,
      }).at(-1);
    if (path === undefined) {
      this.notice = { text: "no config file to save to: HOME is not set", token: "error" };
      host.invalidate();
      return false;
    }
    const text = await host.readFile(path).catch(() => undefined);
    const base = also === undefined ? text : also(text);
    try {
      await host.writeFile(path, withBandTable(base, settings));
    } catch (reason) {
      const why = reason instanceof Error ? reason.message : String(reason);
      this.notice = { text: `could not write ${path}: ${why}`, token: "error" };
      host.invalidate();
      return false;
    }
    this.overrides = {};
    await host.storeSet(BAND_SETTINGS_KEY, {}).catch(() => undefined);
    this.notice = {
      text: `saved the ${also === undefined ? "band" : "panel and band"} settings to ${path}`,
      token: "success",
    };
    this.onChange?.();
    host.invalidate();
    return true;
  }

  /**
   * The band's settings as controls. `saveButton` false leaves out Save to file, for the Settings
   * view, whose own Save to file writes these with the panel's.
   */
  draw(
    ui: PaneUi,
    color: (token: Token) => string,
    { saveButton = true }: { saveButton?: boolean } = {},
  ): RenderElement {
    const { Box, Text, Button, Input } = ui;
    const settings = this.shown;
    const parts = settings?.parts ?? [];
    const hidden = BAND_PARTS.filter((part) => !parts.includes(part));
    const row = (part: BandPart, drawn: boolean) =>
      Box({
        key: `band:part:${part}`,
        flexDirection: "row",
        gap: 1,
        children: present<RenderNode>([
          Button({
            key: `band:toggle:${part}`,
            label: drawn ? "remove" : "add",
            plain: true,
            onPress: () => void this.togglePart(part),
          }),
          drawn
            ? Button({
                key: `band:left:${part}`,
                label: glyphOf("move.earlier"),
                plain: true,
                onPress: () => void this.movePart(part, -1),
              })
            : undefined,
          drawn
            ? Button({
                key: `band:right:${part}`,
                label: glyphOf("move.later"),
                plain: true,
                onPress: () => void this.movePart(part, 1),
              })
            : undefined,
          Text({
            ...(drawn ? {} : { dimColor: true }),
            children: `${part}: ${BAND_PART_LABELS[part]}`,
          }),
        ]),
      });
    return Box({
      key: "band:settings",
      flexDirection: "column",
      borderStyle: "round",
      paddingX: 1,
      children: present<RenderNode>([
        Text({ bold: true, children: "Band settings (every session on this machine)" }),
        ...this.problems.map((problem) => Text({ color: color("warning"), children: problem })),
        this.notice === undefined
          ? undefined
          : Box({
              key: "band:notice",
              children: [Text({ color: color(this.notice.token), children: this.notice.text })],
            }),
        Input({
          key: "band:window",
          label: "Done window",
          placeholder: "24h, 90m, 7d or 2w",
          value: settings?.doneWindow ?? "",
          submitLabel: "set",
          onSubmit: (value) => void this.setWindow(value),
        }),
        Text({ children: "On the band, in order:" }),
        ...parts.map((part) => row(part, true)),
        hidden.length === 0 ? undefined : Text({ children: "Not drawn:" }),
        ...hidden.map((part) => row(part, false)),
        saveButton
          ? Button({
              key: "band:save",
              label: "Save to file",
              plain: true,
              onPress: () => void this.save(),
            })
          : undefined,
      ]),
    });
  }
}

const present = <T>(items: readonly (T | undefined)[]): T[] =>
  items.filter((item): item is T => item !== undefined);
