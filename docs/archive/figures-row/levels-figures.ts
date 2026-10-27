// Archived 2026-10-27 from plugins/beads-ui/hooks/levels.ts at 45d7da1 (see README.md).
// Imports it used there, beyond what levels.ts still imports:
//   type BandFigures, bandFigures, figureCells, sparkBuckets, windowMs from "../core/src/index.ts"
//   type RasterElement from "./components/adapters.ts"
//   FIGURES_RASTER_KEY, figuresRow from "./components/band.ts"
//   isAscii, rasterColorOf from "./components/look.ts"

// The band site's Raster, at the top of the module:
/** The band site's Raster, on the terminal, and the site's id a blit names (T-2C.11). */
export interface BandRaster {
  Raster: RasterElement;
  requestId: string;
}

// Fields of BandLevels:
  /**
   * The figures row's done tasks (T-2C.11): by store, the done count their close times were
   * read at and the times, for the line the figures draw. A store is read while its count is
   * above zero, and again only when the count moves.
   */
  private readonly doneTimes = new Map<string, { done: number; times: number[] }>();
  private readonly doneReading = new Set<string>();
  /** The figures Raster the last redraw drew: where a blit repaints it, and the cells it holds. */
  private drawnRaster: { requestId: string; cells: string; key: string } | undefined;
  /** A blit was sent since that redraw: the next one waits for the next redraw. */
  private blitted = false;
  /** The band's columns at the last redraw that drew the figures Raster. */
  private drawnColumns = 0;

// In recount(), after `if (!this.loaded) return;`:
//   this.readDone();

// Methods of BandLevels:
  /** The line the figures row draws: the band's first, the one its controls follow. */
  private figuresLine(): string | undefined {
    return this.tally.lines[0]?.key;
  }

  /**
   * Reads the close times of the figures line's done tasks in each store whose done count is
   * above zero and moved since its times were read (T-2C.11). A store whose count fell to zero
   * keeps no times. Each read that lands repaints the figures.
   */
  private readDone(): void {
    const key = this.figuresLine();
    if (key === undefined) return;
    for (const { store, done } of this.tally.doneByStore(key)) {
      const id = `${key}:${store.path}`;
      const held = this.doneTimes.get(id);
      if (done === 0) {
        if (held !== undefined) {
          this.doneTimes.delete(id);
          this.repaint();
        }
        continue;
      }
      if (held?.done === done || this.doneReading.has(id)) continue;
      this.doneReading.add(id);
      void this.tally
        .readDoneTimes(key, store)
        .then((times) => {
          if (times !== undefined) this.doneTimes.set(id, { done, times });
          this.repaint();
        })
        .catch(() => undefined)
        .finally(() => this.doneReading.delete(id));
    }
  }

  /** The figures of the figures line in `columns`, at the time its counts were read. */
  private figures(columns: number): BandFigures | undefined {
    const key = this.figuresLine();
    const total = key === undefined ? undefined : this.tally.totalOf(key);
    if (key === undefined || total === undefined) return undefined;
    const settings = this.settings;
    const now = this.tally.last?.readAt ?? 0;
    const times = [...this.doneTimes.entries()]
      .filter(([id]) => id.startsWith(`${key}:`))
      .flatMap(([, held]) => held.times);
    const buckets = sparkBuckets(times, now, windowMs(settings.doneWindow) ?? 0);
    return bandFigures(total.counts, settings.parts, buckets, {
      columns,
      doneWindow: settings.doneWindow,
    });
  }

  /** The figures Raster's cells now, in the columns the last redraw drew it at. */
  private cellsOf(figures: BandFigures): string {
    return figureCells(figures, rasterColorOf, isAscii());
  }

  /**
   * New figures after a read landed: the Raster the last redraw drew is repainted in place
   * through `$.ui.blit`, at most once until the band redraws (the minute beat, a press or a
   * write redraws it); with no Raster drawn, or a blit refused, the band redraws.
   */
  private repaint(): void {
    const host = this.host;
    if (host === undefined) return;
    const drawn = this.drawnRaster;
    if (drawn === undefined) {
      host.invalidate();
      return;
    }
    if (this.blitted) return;
    const figures = this.figures(this.drawnColumns);
    const cells = figures === undefined ? undefined : this.cellsOf(figures);
    if (cells === undefined || cells === drawn.cells) return;
    this.blitted = true;
    drawn.cells = cells;
    void host.blit(drawn.requestId, drawn.key, cells).then((painted) => {
      if (!painted) host.invalidate();
    });
  }

// In draw(): the parameter `raster?: BandRaster`, the resets at its start, and the summary branch:
    this.drawnRaster = undefined;
    this.blitted = false;
    } else if (state.level === "summary" && left >= 1) {
      const row = this.drawFigures(surface, columns, raster);
      if (row !== undefined) blocks.push(row);
    }

  /**
   * The summary level's figures row (D-43, T-2C.11): one Raster row where the band has a Raster,
   * else the same figures as Text. The Raster drawn is recorded, so a read landing before the
   * next redraw repaints it through `$.ui.blit`.
   */
  private drawFigures(
    surface: Surface,
    columns: number,
    raster: BandRaster | undefined,
  ): RenderElement | undefined {
    const figures = this.figures(columns);
    if (figures === undefined) return undefined;
    const doneWindow = this.settings.doneWindow;
    if (raster === undefined) return figuresRow(surface, figures, { color: colorOf, doneWindow });
    const cells = this.cellsOf(figures);
    this.drawnColumns = columns;
    this.drawnRaster = { requestId: raster.requestId, key: FIGURES_RASTER_KEY, cells };
    return figuresRow(surface, figures, {
      color: colorOf,
      doneWindow,
      raster: { Raster: raster.Raster, cells },
    });
  }
