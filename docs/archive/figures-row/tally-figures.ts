// Archived 2026-10-27 from plugins/beads-ui/hooks/tally.ts at 45d7da1 (see README.md).
// Methods of BandTally, the class the band reads its counts from.

  /** Line `key`'s counts as last drawn. */
  totalOf(key: string): BandTotal | undefined {
    const at = this.last?.reads.findIndex((read) => read.key === key) ?? -1;
    return at < 0 ? undefined : this.totals[at];
  }

  /**
   * Line `key`'s done count store by store, as last drawn: the band's figures read the close
   * times of a store's done tasks only while its count is above zero, and again when it moves.
   */
  doneByStore(key: string): { store: BandStore; done: number }[] {
    const last = this.last;
    const read = this.readOf(key);
    const settings = this.drawnWith;
    if (last === undefined || read === undefined || settings === undefined) return [];
    return unique(read.stores).map((store) => ({
      store,
      done: bandTotal({ ...read, stores: [store] }, last.stores, settings.doneWindow).counts.done,
    }));
  }

  /**
   * The close times, in ms, of line `key`'s tasks done within the done window in `store`, as the
   * done count's own read selects them; undefined when the read failed.
   */
  async readDoneTimes(key: string, store: BandStore): Promise<number[] | undefined> {
    const host = this.host;
    const read = this.readOf(key);
    const settings = this.drawnWith;
    if (host === undefined || read === undefined || settings === undefined) return undefined;
    const now = await host.now();
    const span = windowMs(settings.doneWindow) ?? 0;
    const argv = countTasksArgv("closed", {
      ...(read.assignee === undefined ? {} : { assignee: read.assignee }),
      closedAfter: new Date(now - span).toISOString(),
    });
    const ran = await host.runIn(store.path, argv, COUNT_TIMEOUT_MS).catch(() => undefined);
    const parsed = ran?.exitCode === 0 ? parseBdList(ran.stdout) : undefined;
    if (parsed?.ok !== true) return undefined;
    return parsed.value.flatMap((issue) => {
      const at = issue.closedAt === undefined ? Number.NaN : Date.parse(issue.closedAt);
      return Number.isFinite(at) ? [at] : [];
    });
  }
