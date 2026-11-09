import {
  type BoardEvent,
  type BoardState,
  backlogView,
  boardView,
  clockStamp,
  commandById,
  EMPTY_FILTER_STATE,
  INITIAL_BOARD_STATE,
  type Issue,
  type Priority,
  planMove,
  planRank,
  reduceBoard,
} from "@beads-ui/core";
import {
  Analytics,
  Backlog,
  Board,
  CommandPalette,
  IssueDetail,
  type PaletteCommand,
  type ReadFailure,
  Roadmap,
  Sessions,
  useNotify,
  usePaletteChord,
} from "@sergeiwallace/beads-ui-web-ui";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ApiFailure,
  api,
  type BoardPayload,
  type IssuePayload,
  type IssueRef,
  type StoredIssue,
  type StoreRead,
  signOut,
} from "./api.ts";

/** The views with a page of their own, in the order the nav lists them. */
const VIEWS = [
  { view: "board", label: "Board", path: "" },
  { view: "backlog", label: "Backlog", path: "backlog" },
  { view: "roadmap", label: "Roadmap", path: "roadmap" },
  { view: "analytics", label: "Analytics", path: "analytics" },
  { view: "sessions", label: "Sessions", path: "sessions" },
] as const;

type ViewName = (typeof VIEWS)[number]["view"];
/** A view, and the store it is narrowed to: none is every open store. */
type Route =
  | { view: ViewName; store?: string | undefined }
  | { view: "issue"; id: string; store?: string | undefined };

const base = import.meta.env.BASE_URL;
// Wide enough that core's terminal truncation never cuts a title in the browser.
const NO_TRUNCATION = 10_000;
const STORE_PARAM = "store";

function routeOf(location: Location): Route {
  const { pathname } = location;
  const path = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  const store = new URLSearchParams(location.search).get(STORE_PARAM) || undefined;
  const issue = /^issues\/(.+)$/.exec(path);
  if (issue?.[1] !== undefined) return { view: "issue", id: decodeURIComponent(issue[1]), store };
  const view = VIEWS.find((entry) => entry.path !== "" && entry.path === path);
  return { view: view?.view ?? "board", store };
}

const withStore = (path: string, store: string | undefined) =>
  store === undefined ? path : `${path}?${STORE_PARAM}=${encodeURIComponent(store)}`;

const hrefOf = (route: Route): string =>
  route.view === "issue"
    ? withStore(`${base}issues/${encodeURIComponent(route.id)}`, route.store)
    : withStore(
        `${base}${VIEWS.find((entry) => entry.view === route.view)?.path ?? ""}`,
        route.store,
      );

const stamp = () => clockStamp(Date.now(), new Date().getTimezoneOffset());

const failedStale = (event: BoardEvent): boolean =>
  (event.type === "move-failed" || event.type === "rank-failed") && event.exitCode === 13;

function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState(() => routeOf(window.location));
  useEffect(() => {
    const onPop = () => setRoute(routeOf(window.location));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = useCallback((next: Route) => {
    window.history.pushState(null, "", hrefOf(next));
    setRoute(next);
  }, []);
  return [route, navigate];
}

type Meta = Omit<BoardPayload, "issues" | "statuses" | "reads">;

/**
 * The board's issues keyed for core's reducers, which key by id: an issue keeps its own id while
 * the read covers one store, and is keyed by repository and id once it covers several, so the
 * same id in two stores is two cards and neither shadows the other.
 */
function keyed(payload: { issues: StoredIssue[]; reads: StoreRead[] }): {
  issues: Issue[];
  refs: Map<string, IssueRef>;
} {
  const several = payload.reads.length > 1;
  const refs = new Map<string, IssueRef>();
  const issues = payload.issues.map((issue) => {
    const key = several ? `${issue.repository}:${issue.id}` : issue.id;
    refs.set(key, { id: issue.id, repository: issue.repository });
    return { ...issue, id: key, displayId: issue.displayId ?? issue.id };
  });
  return { issues, refs };
}

function useBoard(store: string | undefined) {
  const [state, dispatch] = useReducer(reduceBoard, INITIAL_BOARD_STATE);
  const [meta, setMeta] = useState<Meta | undefined>(undefined);
  const [reads, setReads] = useState<StoreRead[]>([]);
  const [writing, setWriting] = useState<ReadonlySet<string>>(new Set());
  const notify = useNotify();
  const latest = useRef<BoardState>(state);
  latest.current = state;
  const refs = useRef(new Map<string, IssueRef>());
  const shownStore = useRef(store);
  shownStore.current = store;
  // Every event goes through here, so a plan made right after one sees the state it made.
  const send = useCallback((event: BoardEvent): BoardState => {
    latest.current = reduceBoard(latest.current, event);
    dispatch(event);
    return latest.current;
  }, []);

  /** The store and id a card's key stands for. */
  const refOf = useCallback((key: string): IssueRef => refs.current.get(key) ?? { id: key }, []);

  const load = useCallback(async () => {
    try {
      const payload = await api.board(store);
      // A read for a store the page has since left is dropped.
      if (shownStore.current !== store) return;
      const { issues: stored, statuses, reads: storeReads, ...rest } = payload;
      const { issues, refs: next } = keyed({ issues: stored, reads: storeReads });
      refs.current = next;
      send({ type: "load-succeeded", issues, statuses, at: stamp() });
      setMeta(rest);
      setReads(storeReads);
    } catch (error) {
      if (!(error instanceof ApiFailure)) throw error;
      if (shownStore.current !== store) return;
      setReads(error.reads);
      send({
        type: "load-failed",
        ...(error.error.source === undefined ? {} : { command: error.error.source }),
        exitCode: error.error.exitCode ?? null,
        message: error.error.message,
      });
    }
  }, [send, store]);

  const refreshSeconds = Math.max(10, meta?.refreshSeconds ?? 10);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), refreshSeconds * 1000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load, refreshSeconds]);

  // A refused write queues its card for a re-read (core's refresh list).
  useEffect(() => {
    for (const key of state.refresh) {
      const ref = refOf(key);
      api.issue(ref).then(
        ({ issue }) =>
          send({
            type: "issue-refreshed",
            issue: { ...issue, id: key, displayId: issue.displayId ?? issue.id },
          }),
        () => void load(),
      );
    }
  }, [state.refresh, load, send, refOf]);

  // A refusal's toast says what core's board view says of it, from the state the refusal made.
  const refused = (event: BoardEvent, title: string, reason?: string) => {
    const next = send(event);
    const line = boardView(next, { columnWidth: NO_TRUNCATION }).conflictLine;
    notify(failedStale(event) ? "conflict" : "error", title, reason ?? line ?? title);
  };

  const move = (id: string, to: string) => {
    const plan = planMove(latest.current, id, to);
    if (!plan.ok) {
      if (plan.error.kind !== "same-status") notify("error", "Not moved", plan.error.message);
      return;
    }
    const shown = latest.current.issues.find((issue) => issue.id === id)?.status ?? "";
    send(plan.value.event);
    api.move(refOf(id), to, shown).then(
      (moved) => {
        send({ type: "move-succeeded", id });
        // A leased task's move is a request the queue writes to Beads when its bridge runs.
        if (moved.via === "queue") {
          notify(
            "info",
            "Requested through the work queue",
            `${moved.holder ?? "A session"} holds ${moved.id}; the queue writes ${to} to Beads.`,
          );
        } else if (moved.notice !== undefined) {
          notify("info", "Written through bd", moved.notice);
        }
      },
      (error: unknown) => {
        const failure = error instanceof ApiFailure ? error : undefined;
        const event: BoardEvent = {
          type: "move-failed",
          id,
          exitCode: failure?.exitCode ?? 1,
          message: failure?.message ?? String(error),
        };
        // The work queue's refusal names the status it holds; say that, not bd's conflict line.
        const fromQueue = failure?.error.source?.startsWith("POST /api/queue/") === true;
        refused(
          event,
          fromQueue
            ? "The work queue refused the move"
            : failure?.exitCode === 13
              ? "Changed elsewhere"
              : "Move failed",
          fromQueue ? failure?.message : undefined,
        );
      },
    );
  };

  const reorder = (id: string, index: number) => {
    const plan = planRank(latest.current, id, index, Math.random);
    if (!plan.ok) {
      if (plan.error.kind !== "same-place") notify("error", "Not reordered", plan.error.message);
      return;
    }
    const { event, shown, above, below } = plan.value;
    send(event);
    api
      .rank(
        refOf(id),
        shown,
        above === undefined ? undefined : refOf(above),
        below === undefined ? undefined : refOf(below),
      )
      .then(
        ({ rank }) => send({ type: "rank-succeeded", id, key: rank }),
        (error: unknown) => {
          const failure = error instanceof ApiFailure ? error : undefined;
          const failed: BoardEvent = {
            type: "rank-failed",
            id,
            exitCode: failure?.exitCode ?? null,
            message: failure?.message ?? String(error),
          };
          refused(failed, failure?.exitCode === 13 ? "Changed elsewhere" : "Reorder failed");
        },
      );
  };

  const setPriority = (id: string, priority: Priority) => {
    const shown = latest.current.issues.find((issue) => issue.id === id)?.status;
    if (shown === undefined) return;
    setWriting((current) => new Set(current).add(id));
    api
      .priority(refOf(id), priority, shown)
      .catch((error: unknown) => {
        const failure = error instanceof ApiFailure ? error : undefined;
        if (failure?.exitCode === 13) {
          notify(
            "conflict",
            "Changed elsewhere",
            `${refOf(id).id} changed before the priority was written; re-read`,
          );
        } else {
          notify("error", "Priority not written", failure?.message ?? String(error));
        }
      })
      .finally(() => {
        setWriting((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        void load();
      });
  };

  return { state, meta, reads, writing, refOf, move, reorder, setPriority };
}

interface DetailRead {
  key: string;
  payload?: IssuePayload;
  error?: ReadFailure;
}

function useIssue(ref: IssueRef | undefined): DetailRead | undefined {
  const [read, setRead] = useState<DetailRead | undefined>(undefined);
  const id = ref?.id;
  const repository = ref?.repository;
  const key = id === undefined ? undefined : `${repository ?? ""}:${id}`;
  useEffect(() => {
    if (id === undefined || key === undefined) return;
    let live = true;
    setRead({ key });
    api.issue({ id, repository }).then(
      (payload) => live && setRead({ key, payload }),
      (error: unknown) => {
        if (!live) return;
        const failure = error instanceof ApiFailure ? error.error : undefined;
        setRead({
          key,
          error: {
            source: failure?.source ?? "bd show",
            message: failure?.message ?? String(error),
          },
        });
      },
    );
    return () => {
      live = false;
    };
  }, [id, repository, key]);
  return read?.key === key ? read : undefined;
}

interface ViewRead<T> {
  data?: T;
  error?: ReadFailure;
  loading: boolean;
}

/**
 * A view's read while its page is open: on open, on focus, every `everySeconds` when given, and
 * again whenever `key` changes. A failed read keeps the last data and says what failed.
 */
function useViewRead<T>(
  active: boolean,
  key: string,
  read: (key: string) => Promise<T>,
  everySeconds?: number,
): ViewRead<T> {
  const [state, setState] = useState<ViewRead<T>>({ loading: false });
  const latest = useRef(read);
  latest.current = read;
  useEffect(() => {
    if (!active) return;
    let live = true;
    const load = () => {
      setState((current) => ({ ...current, loading: true }));
      latest.current(key).then(
        (data) => live && setState({ data, loading: false }),
        (error: unknown) => {
          if (!live) return;
          const failure = error instanceof ApiFailure ? error.error : undefined;
          setState((current) => ({
            ...current,
            loading: false,
            error: {
              source: failure?.source ?? "the beads-ui server",
              message: failure?.message ?? String(error),
            },
          }));
        },
      );
    };
    load();
    window.addEventListener("focus", load);
    const timer =
      everySeconds === undefined ? undefined : window.setInterval(load, everySeconds * 1000);
    return () => {
      live = false;
      window.removeEventListener("focus", load);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [active, key, everySeconds]);
  return state;
}

/** What Roadmap, Analytics and Sessions say while several stores are open and none is chosen. */
function PickStore({ needed }: { needed: boolean }) {
  if (!needed) return null;
  return (
    <p className="bu-dim app-pick-store" role="status">
      This view reads one store: pick it in the store menu.
    </p>
  );
}

function ReadState({ read }: { read: ViewRead<unknown> }) {
  if (read.error !== undefined) {
    return (
      <p className="bu-read-error" role="alert">
        <strong>{read.error.source}</strong> failed: {read.error.message}
      </p>
    );
  }
  if (read.data === undefined)
    return (
      <p className="bu-dim" aria-busy="true">
        Reading the store...
      </p>
    );
  return null;
}

export function App() {
  const [route, navigate] = useRoute();
  // The detail reads its issue in the issue's own store; the board, picker and nav cover the
  // store the list views are narrowed to, which on the detail is every store.
  const listStore = route.view === "issue" ? undefined : route.store;
  const { state, meta, reads, writing, refOf, move, reorder, setPriority } = useBoard(listStore);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const rank = meta?.rank ?? false;
  const detail = useIssue(
    route.view === "issue" ? { id: route.id, repository: route.store } : undefined,
  );
  // Roadmap, Analytics and Sessions read one store: the one chosen, or the only one open. With
  // several open and none chosen (null), they ask for one rather than read.
  const viewStore = listStore ?? ((meta?.repositories ?? []).length > 1 ? null : undefined);
  const storeKey = viewStore ?? "";
  const [weeks, setWeeks] = useState(12);
  const [sprint, setSprint] = useState<string | undefined>(undefined);
  const roadmap = useViewRead(
    route.view === "roadmap" && viewStore !== null,
    `roadmap ${storeKey}`,
    () => api.roadmap(viewStore ?? undefined),
  );
  const analytics = useViewRead(
    route.view === "analytics" && viewStore !== null,
    `${weeks} ${sprint ?? ""} ${storeKey}`,
    () => api.analytics(weeks, sprint, viewStore ?? undefined),
  );
  const sessions = useViewRead(
    route.view === "sessions" && viewStore !== null,
    `sessions ${storeKey}`,
    () => api.sessions(viewStore ?? undefined),
    Math.max(10, meta?.refreshSeconds ?? 10),
  );

  usePaletteChord(useCallback(() => setPaletteOpen(true), []));

  // A card's link and its open action address its own store, so the detail reads the right issue.
  const issueRoute = useCallback(
    (key: string): Route => {
      const ref = refOf(key);
      return { view: "issue", id: ref.id, store: ref.repository };
    },
    [refOf],
  );
  const issueHref = useCallback((key: string) => hrefOf(issueRoute(key)), [issueRoute]);
  const openIssue = useCallback((key: string) => navigate(issueRoute(key)), [navigate, issueRoute]);
  // Roadmap, Analytics and Sessions name issues by id within the one store they read.
  const viewIssueRoute = useCallback(
    (id: string): Route => ({ view: "issue", id, store: viewStore ?? undefined }),
    [viewStore],
  );
  const viewIssueHref = useCallback((id: string) => hrefOf(viewIssueRoute(id)), [viewIssueRoute]);
  // With no store chosen, every card and row names the repository it comes from.
  const repositoryOf = useMemo(
    () => (listStore === undefined ? (key: string) => refOf(key).repository : undefined),
    [listStore, refOf],
  );

  const board = useMemo(
    () =>
      boardView(state, {
        columnWidth: NO_TRUNCATION,
        rank,
        ...(meta === undefined ? {} : { softWipLimit: meta.softWipLimit }),
      }),
    [state, rank, meta],
  );
  const backlog = useMemo(
    () =>
      backlogView(state.issues, {
        statuses: state.statuses,
        filter: EMPTY_FILTER_STATE,
        titleWidth: NO_TRUNCATION,
        idWidth: 64,
        rank,
      }),
    [state.issues, state.statuses, rank],
  );
  const statusNames = useMemo(() => board.columns.map((column) => column.status), [board]);
  const selected = state.issues.find((issue) => issue.id === selectedId);
  const listView = route.view === "issue" ? "board" : route.view;

  const commands = useMemo((): PaletteCommand[] => {
    const moveLabel = commandById("card.move")?.label ?? "Move to";
    const list: PaletteCommand[] = [];
    if (selected !== undefined) {
      const name = `${selected.displayId ?? selected.id} ${selected.title}`;
      for (const status of statusNames) {
        if (status === selected.status) continue;
        list.push({
          id: `move:${status}`,
          label: `${moveLabel} ${status}`,
          detail: name,
          run: () => move(selected.id, status),
        });
      }
      list.push({
        id: "open",
        label: "Open detail",
        detail: name,
        run: () => openIssue(selected.id),
      });
    }
    for (const entry of VIEWS) {
      list.push({
        id: `go:${entry.view}`,
        label: `Go to ${entry.label}`,
        run: () => navigate({ view: entry.view, store: listStore }),
      });
    }
    return list;
  }, [selected, statusNames, navigate, move, openIssue, listStore]);

  const pending = useMemo(
    () => new Set([...Object.keys(state.pending), ...Object.keys(state.ranking ?? {}), ...writing]),
    [state.pending, state.ranking, writing],
  );
  const repositories = meta?.repositories ?? [];
  const failedReads = reads.filter((read) => !read.ok);

  return (
    <div className="app">
      <header className="app-bar">
        {repositories.length === 0 ? (
          <span className="app-store" title="The Beads stores this server reads">
            {meta?.store ?? "beads-ui"}
          </span>
        ) : (
          <select
            className="bu-select app-store"
            aria-label="Store"
            title="The Beads stores this server reads"
            value={listStore ?? ""}
            onChange={(event) =>
              navigate({ view: listView, store: event.target.value || undefined })
            }
          >
            <option value="">All stores</option>
            {repositories.map((repository) => (
              <option key={repository} value={repository}>
                {repository}
              </option>
            ))}
          </select>
        )}
        <nav className="app-nav" aria-label="Views">
          {VIEWS.map((entry) => (
            <a
              key={entry.view}
              href={hrefOf({ view: entry.view, store: listStore })}
              aria-current={route.view === entry.view ? "page" : undefined}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                navigate({ view: entry.view, store: listStore });
              }}
            >
              {entry.label}
            </a>
          ))}
        </nav>
        <span className="app-stamp">{board.asOf ?? ""}</span>
        <button
          type="button"
          className="bu-button app-palette"
          onClick={() => setPaletteOpen(true)}
        >
          Commands <kbd>Ctrl K</kbd>
        </button>
        <button
          type="button"
          className="bu-button app-sign-out"
          onClick={() => {
            void signOut().finally(() => window.location.reload());
          }}
        >
          Sign out
        </button>
      </header>
      {board.errorLine !== undefined && (
        <p className="app-error" role="alert">
          {board.errorLine}
        </p>
      )}
      {failedReads.map((read) => (
        <p
          key={read.repository}
          className="app-error"
          role="alert"
          data-failed-store={read.repository}
        >
          {read.repository}: {read.error.source ?? "the read"} failed: {read.error.message}
        </p>
      ))}
      {(meta?.problems ?? []).map((problem) => (
        <p key={problem} className="app-problem">
          beads-ui.toml: {problem}
        </p>
      ))}
      {(meta?.health ?? []).map((line) => (
        <p key={line} className="app-problem">
          {line}
        </p>
      ))}
      <main className="app-main">
        {route.view === "board" && (
          <Board
            view={board}
            rank={rank}
            selectedId={selectedId}
            onSelect={setSelectedId}
            issueHref={issueHref}
            onOpen={openIssue}
            onMove={move}
            onReorder={reorder}
            {...(repositoryOf === undefined ? {} : { repositoryOf })}
          />
        )}
        {route.view === "backlog" && (
          <Backlog
            view={backlog}
            issue={(id) => state.issues.find((issue) => issue.id === id)}
            statuses={statusNames}
            pending={pending}
            issueHref={issueHref}
            onOpen={openIssue}
            onStatus={move}
            onPriority={setPriority}
            {...(repositoryOf === undefined ? {} : { repositoryOf })}
          />
        )}
        {route.view === "roadmap" && (
          <>
            <PickStore needed={viewStore === null} />
            <ReadState read={roadmap} />
            {roadmap.data !== undefined && (
              <Roadmap
                view={roadmap.data.view}
                issueHref={viewIssueHref}
                onOpen={(id) => navigate(viewIssueRoute(id))}
              />
            )}
          </>
        )}
        {route.view === "analytics" && (
          <>
            <PickStore needed={viewStore === null} />
            <ReadState read={analytics} />
            {analytics.data !== undefined && (
              <Analytics
                view={analytics.data.view}
                sprints={analytics.data.sprints}
                sprint={analytics.data.sprint}
                weeks={weeks}
                cost={analytics.data.cost}
                historyFailures={analytics.data.histories.failed}
                issueHref={viewIssueHref}
                onWeeks={setWeeks}
                onSprint={(name) => setSprint(name === "" ? undefined : name)}
              />
            )}
          </>
        )}
        {route.view === "sessions" && (
          <>
            <PickStore needed={viewStore === null} />
            <ReadState read={sessions} />
            {sessions.data !== undefined && (
              <Sessions
                view={sessions.data.view}
                queueError={
                  sessions.data.queueError === undefined
                    ? undefined
                    : {
                        source: sessions.data.queueError.source ?? "the work queue",
                        message: sessions.data.queueError.message,
                      }
                }
                issueHref={(row) => {
                  const task = row.currentTask;
                  if (task === undefined) return undefined;
                  const here = task.repo === undefined || task.repo === sessions.data?.store;
                  return here ? viewIssueHref(task.id) : undefined;
                }}
              />
            )}
          </>
        )}
        {route.view === "issue" && (
          <IssueDetail
            loading={detail?.payload === undefined && detail?.error === undefined}
            issue={detail?.payload?.issue}
            repository={detail?.payload?.repository}
            issueError={detail?.error}
            comments={detail?.payload?.comments ?? null}
            commentsError={
              detail?.payload?.commentsError === undefined
                ? undefined
                : {
                    source: detail.payload.commentsError.source ?? "bd comments",
                    message: detail.payload.commentsError.message,
                  }
            }
            issueHref={(id) =>
              hrefOf({ view: "issue", id, store: detail?.payload?.repository ?? route.store })
            }
          />
        )}
      </main>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        commands={commands}
        context={
          selected === undefined
            ? "No card selected: select one on the Board to move it"
            : `Selected: ${selected.displayId ?? selected.id} ${selected.title}`
        }
      />
    </div>
  );
}
