import {
  type BoardEvent,
  type BoardState,
  backlogView,
  boardView,
  clockStamp,
  commandById,
  decodeQueueFilters,
  EMPTY_FILTER_STATE,
  INITIAL_BOARD_STATE,
  type Issue,
  orderByPriorityRank,
  type Priority,
  parseSprintSelection,
  planMove,
  planRank,
  type QueueFilters,
  reduceBoard,
  type SprintSelection,
  sprintLabelsOf,
  sprintSelectionText,
  sprintView,
  withQueueFilters,
} from "@beads-ui/core";
import {
  Analytics,
  Backlog,
  Board,
  CommandPalette,
  dropIndex,
  HeldDetail,
  IssueDetail,
  listView,
  type OwnerChoices,
  OwnerPicker,
  type PaletteCommand,
  PriorityEdit,
  planListRank,
  QueueView,
  type ReadFailure,
  type Refusal,
  Roadmap,
  Sessions,
  type SprintMode,
  SprintView,
  stepIndex,
  useFieldEdits,
  useNotify,
  usePaletteChord,
} from "@sergeiwallace/beads-ui-web-ui";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { pageFeed } from "../src/live/shared-feed.ts";
import {
  ApiFailure,
  api,
  type BoardPayload,
  HandoffPending,
  type IssuePayload,
  type IssueRef,
  type StoredIssue,
  type StoreRead,
  signOut,
} from "./api.ts";
import { base } from "./base.ts";
import { ReviewPage, shortcutCommand, TaskComposer, TaskHandoff, useKeymap } from "./review.tsx";

/** The views with a page of their own, in the order the nav lists them. */
const VIEWS = [
  { view: "board", label: "Board", path: "" },
  { view: "backlog", label: "Backlog", path: "backlog" },
  { view: "roadmap", label: "Roadmap", path: "roadmap" },
  { view: "analytics", label: "Analytics", path: "analytics" },
  { view: "sessions", label: "Sessions", path: "sessions" },
  // The Review queue (client/review.tsx).
  { view: "review", label: "Review", path: "review" },
  // Phase W1's Sprint and Queue views (web app design T-W1.0, T-W1.5).
  { view: "sprints", label: "Sprints", path: "sprints" },
  { view: "queue", label: "Queue", path: "queue" },
] as const;

type ViewName = (typeof VIEWS)[number]["view"];
/**
 * A view, and the store it is narrowed to: none is every open store. `query` is the rest of the
 * URL's query, as written: the Queue view's filters and the Sprint view's sprint live there.
 */
type Route =
  | { view: ViewName; store?: string | undefined; query?: string | undefined }
  | { view: "issue"; id: string; store?: string | undefined }
  | { view: "held"; path: string };

// Wide enough that core's terminal truncation never cuts a title in the browser.
const NO_TRUNCATION = 10_000;
const STORE_PARAM = "store";
/** The Queue view's blocked filter and the Sprint view's selection, in the URL's query. */
const BLOCKED_PARAM = "blocked";
const SPRINT_PARAM = "sprint";

/** The query without its `store=` pair, kept as written so the filters' encoding survives. */
function restOf(search: string): string {
  const body = search.startsWith("?") ? search.slice(1) : search;
  return body
    .split("&")
    .filter((pair) => pair !== "" && !pair.startsWith(`${STORE_PARAM}=`))
    .join("&");
}

function routeOf(location: Location): Route {
  const { pathname } = location;
  const path = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  const params = new URLSearchParams(location.search);
  const store = params.get(STORE_PARAM) || undefined;
  const issue = /^issues\/(.+)$/.exec(path);
  if (issue?.[1] !== undefined) return { view: "issue", id: decodeURIComponent(issue[1]), store };
  if (path === "held") return { view: "held", path: params.get("path") ?? "" };
  const view = VIEWS.find((entry) => entry.path !== "" && entry.path === path);
  const query = restOf(location.search);
  return { view: view?.view ?? "board", store, ...(query === "" ? {} : { query }) };
}

const withStore = (path: string, store: string | undefined, query?: string) => {
  const parts = [
    ...(store === undefined ? [] : [`${STORE_PARAM}=${encodeURIComponent(store)}`]),
    ...(query === undefined || query === "" ? [] : [query]),
  ];
  return parts.length === 0 ? path : `${path}?${parts.join("&")}`;
};

const hrefOf = (route: Route): string =>
  route.view === "issue"
    ? withStore(`${base}issues/${encodeURIComponent(route.id)}`, route.store)
    : route.view === "held"
      ? `${base}held?path=${encodeURIComponent(route.path)}`
      : withStore(
          `${base}${VIEWS.find((entry) => entry.view === route.view)?.path ?? ""}`,
          route.store,
          route.query,
        );

/** One parameter of a raw query, decoded; undefined when absent. */
function queryParam(query: string | undefined, name: string): string | undefined {
  for (const pair of (query ?? "").split("&")) {
    const at = pair.indexOf("=");
    if (at < 0 || pair.slice(0, at) !== name) continue;
    try {
      return decodeURIComponent(pair.slice(at + 1));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** `query` with parameter `name` set to `value`, or dropped for undefined; others kept as written. */
function withParam(query: string | undefined, name: string, value: string | undefined): string {
  const kept = (query ?? "")
    .split("&")
    .filter((pair) => pair !== "" && pair.split("=", 1)[0] !== name);
  if (value !== undefined) kept.push(`${name}=${encodeURIComponent(value)}`);
  return kept.join("&");
}

const stamp = () => clockStamp(Date.now(), new Date().getTimezoneOffset());

const failedStale = (event: BoardEvent): boolean =>
  (event.type === "move-failed" || event.type === "rank-failed") && event.exitCode === 13;

/** What a refused inline edit says (T-W1.0): a conflict, or why else it was refused. */
const describeRefusal = (error: unknown): Refusal => {
  if (error instanceof HandoffPending)
    return { conflict: false, message: error.message, kind: "info" };
  const failure = error instanceof ApiFailure ? error : undefined;
  const info =
    failure?.error.kind === "handoff-required" || failure?.error.kind === "owner-unknown";
  return {
    conflict: failure?.exitCode === 13,
    message:
      failure?.error.retry === true
        ? `${failure.message}. Pick the owner again to retry.`
        : (failure?.message ?? String(error)),
    ...(info ? { kind: "info" as const } : {}),
  };
};

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

/** The sprint `issue` sits in, as a sprint move's `from`: its first sprint, or the backlog. */
const sprintOf = (issue: Issue): string => {
  const [name] = sprintLabelsOf(issue);
  return name === undefined ? "backlog" : sprintSelectionText({ kind: "sprint", name });
};

function useBoard(store: string | undefined) {
  const [state, dispatch] = useReducer(reduceBoard, INITIAL_BOARD_STATE);
  const [meta, setMeta] = useState<Meta | undefined>(undefined);
  const [reads, setReads] = useState<StoreRead[]>([]);
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

  // The change feed (T-W3.1) reads the board again the moment a store's head moves; the timer
  // below stays as the fallback for a page whose stream is down.
  const [feedStale, setFeedStale] = useState<string | undefined>(undefined);
  useEffect(
    () =>
      pageFeed(base).subscribe((message) => {
        if (message.type === "stale") {
          setFeedStale(message.data.since);
          return;
        }
        setFeedStale(undefined);
        void load();
      }),
    [load],
  );
  // Inline edits of priority and owner: the new value shows at once and a conflict rolls back.
  const edits = useFieldEdits(describeRefusal, load);

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
              ? "Status not written: changed elsewhere"
              : "Move failed",
          fromQueue ? failure?.message : undefined,
        );
      },
    );
  };

  const rankFailed = (id: string, error: unknown) => {
    const failure = error instanceof ApiFailure ? error : undefined;
    const failed: BoardEvent = {
      type: "rank-failed",
      id,
      exitCode: failure?.exitCode ?? null,
      message: failure?.message ?? String(error),
    };
    refused(failed, failure?.exitCode === 13 ? "Changed elsewhere" : "Reorder failed");
  };

  /** A reorder inside a Board column; `scope` is the issues the board draws, when not all. */
  const reorder = (id: string, index: number, scope?: readonly Issue[]) => {
    const planned =
      scope === undefined ? latest.current : { ...latest.current, issues: [...scope] };
    const plan = planRank(planned, id, index, Math.random);
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
        (error: unknown) => rankFailed(id, error),
      );
  };

  /** A backlog or sprint list's reorder: slot `index` among the rows of the row's priority. */
  const reorderList = (rows: readonly Issue[], id: string, index: number) => {
    const plan = planListRank(rows, id, index, Math.random);
    if (!plan.ok) {
      if (plan.error.kind !== "same-place") notify("error", "Not reordered", plan.error.message);
      return;
    }
    const { key, shown, priority, above, below } = plan.value;
    send({ type: "rank-requested", id, key });
    api
      .listRank(
        refOf(id),
        shown,
        priority,
        above === undefined ? undefined : refOf(above),
        below === undefined ? undefined : refOf(below),
      )
      .then(
        ({ rank }) => send({ type: "rank-succeeded", id, key: rank }),
        (error: unknown) => rankFailed(id, error),
      );
  };

  const stepList = (rows: readonly Issue[], id: string, delta: -1 | 1) => {
    const index = stepIndex(rows, id, delta);
    if (index !== undefined) reorderList(rows, id, index);
  };

  const dropList = (rows: readonly Issue[], id: string, target: string, below: boolean) => {
    const slot = dropIndex(rows, id, target, below);
    if (!slot.ok) {
      notify("error", "Not reordered", slot.error.message);
      return;
    }
    reorderList(rows, id, slot.index);
  };

  /** Moves an issue between the backlog and a sprint (T-W1.0, D-5 of the beads-ui design). */
  const moveToSprint = (id: string, to: string) => {
    const issue = latest.current.issues.find((candidate) => candidate.id === id);
    if (issue === undefined) return;
    const from = sprintOf(issue);
    if (from === to) return;
    api.sprint(refOf(id), to, from, issue.status).then(
      () => void load(),
      (error: unknown) => {
        const failure = error instanceof ApiFailure ? error : undefined;
        notify(
          failure?.exitCode === 13 ? "conflict" : "error",
          failure?.exitCode === 13 ? "Sprint not written: changed elsewhere" : "Sprint not written",
          failure?.message ?? String(error),
        );
        void load();
      },
    );
  };

  const setPriority = (id: string, priority: Priority) => {
    const issue = latest.current.issues.find((candidate) => candidate.id === id);
    if (issue === undefined) return;
    edits.edit(id, issue.displayId ?? id, "priority", priority, () =>
      api.priority(refOf(id), priority, issue.status),
    );
  };

  /**
   * The owner picker's choice. An unclaimed task takes a guarded assignee write; a claimed one's
   * change goes to the server's handoff path, which T-W2.2's handoff request replaces.
   */
  const setOwner = (id: string, to: string) => {
    const issue = latest.current.issues.find((candidate) => candidate.id === id);
    if (issue === undefined) return;
    edits.edit(id, issue.displayId ?? id, "owner", to, () =>
      api.owner(refOf(id), to, issue.assignee ?? "", issue.status),
    );
  };

  return {
    state,
    meta,
    reads,
    edits,
    refOf,
    move,
    reorder,
    stepList,
    dropList,
    moveToSprint,
    setPriority,
    setOwner,
    feedStale,
  };
}

interface DetailRead {
  key: string;
  payload?: IssuePayload;
  error?: ReadFailure;
  /** The store a failed read names, so the failure does not wait on the board read to name it. */
  failedIn?: string;
}

function useIssue(ref: IssueRef | undefined): [DetailRead | undefined, () => Promise<void>] {
  const [read, setRead] = useState<DetailRead | undefined>(undefined);
  const [version, setVersion] = useState(0);
  const settled = useRef<(() => void)[]>([]);
  const id = ref?.id;
  const repository = ref?.repository;
  const key = id === undefined ? undefined : `${repository ?? ""}:${id}`;
  useEffect(() => {
    if (id === undefined || key === undefined) return;
    let live = true;
    if (version === 0) setRead({ key });
    const done = () => {
      for (const resolve of settled.current.splice(0)) resolve();
    };
    api.issue({ id, repository }).then(
      (payload) => {
        if (live) setRead({ key, payload });
        done();
      },
      (error: unknown) => {
        if (live) {
          const failure = error instanceof ApiFailure ? error.error : undefined;
          setRead({
            key,
            error: {
              source: failure?.source ?? "bd show",
              message: failure?.message ?? String(error),
            },
            ...(failure?.repository === undefined ? {} : { failedIn: failure.repository }),
          });
        }
        done();
      },
    );
    return () => {
      live = false;
    };
  }, [id, repository, key, version]);
  const reload = useCallback(
    () =>
      new Promise<void>((resolve) => {
        settled.current.push(resolve);
        setVersion((current) => current + 1);
      }),
    [],
  );
  return [read?.key === key ? read : undefined, reload];
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

/** The owner picker's sessions, read per store each time a picker opens. */
function useOwnerChoices() {
  const [byStore, setByStore] = useState<
    Readonly<Record<string, { choices?: OwnerChoices; error?: string }>>
  >({});
  const load = useCallback((store: string | undefined) => {
    const key = store ?? "";
    api.owners(store).then(
      (payload) =>
        setByStore((current) => ({
          ...current,
          [key]: {
            choices: {
              candidates: payload.candidates,
              source: payload.source,
              note:
                payload.queueError === undefined
                  ? undefined
                  : `${payload.queueError.source} failed: ${payload.queueError.message}`,
            },
          },
        })),
      (error: unknown) =>
        setByStore((current) => ({
          ...current,
          [key]: {
            error:
              error instanceof ApiFailure
                ? `${error.error.source ?? "the owner list"} failed: ${error.message}`
                : String(error),
          },
        })),
    );
  }, []);
  const of = useCallback((store: string | undefined) => byStore[store ?? ""], [byStore]);
  return { of, load };
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
  const listStore = route.view === "issue" || route.view === "held" ? undefined : route.store;
  const listQuery = route.view === "issue" || route.view === "held" ? undefined : route.query;
  const {
    state,
    meta,
    reads,
    edits,
    refOf,
    move,
    reorder,
    stepList,
    dropList,
    moveToSprint,
    setPriority,
    setOwner,
    feedStale,
  } = useBoard(listStore);
  const owners = useOwnerChoices();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const keymap = useKeymap();
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const rank = meta?.rank ?? false;
  const [detail, reloadDetail] = useIssue(
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
  // Phase W1: the Queue view's blocked filter and the held item a detail reads.
  const queueBlocked = queryParam(listQuery, BLOCKED_PARAM) === "1";
  const queueFilters = useMemo(() => decodeQueueFilters(listQuery ?? ""), [listQuery]);
  const queue = useViewRead(
    route.view === "queue",
    `queue ${queueBlocked}`,
    () => api.queueView(queueBlocked),
    Math.max(10, meta?.refreshSeconds ?? 10),
  );
  const heldPath = route.view === "held" ? route.path : "";
  const held = useViewRead(route.view === "held", `held ${heldPath}`, () => api.heldItem(heldPath));
  const [sprintMode, setSprintMode] = useState<SprintMode>("board");

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
  const navView = route.view === "issue" || route.view === "held" ? "board" : route.view;

  // Phase W1: the Sprint view's model, the sprints a card can move to, and inline edits.
  // The selection is kept as its URL text, so a fresh object for the same sprint is no change.
  const sprintText = sprintSelectionText(
    parseSprintSelection(queryParam(listQuery, SPRINT_PARAM) ?? "backlog"),
  );
  const sprintModel = useMemo(() => {
    const selection: SprintSelection = parseSprintSelection(sprintText);
    return sprintView(state.issues, {
      statuses: state.statuses,
      selection,
      ...(rank ? { order: orderByPriorityRank } : {}),
    });
  }, [state.issues, state.statuses, rank, sprintText]);
  const sprintBoard = useMemo(
    () =>
      boardView(
        { ...state, issues: sprintModel.list },
        {
          columnWidth: NO_TRUNCATION,
          rank,
          ...(meta === undefined ? {} : { softWipLimit: meta.softWipLimit }),
        },
      ),
    [state, sprintModel, rank, meta],
  );
  const sprintTargets = useCallback(
    (key: string) => {
      const issue = state.issues.find((candidate) => candidate.id === key);
      const current = issue === undefined ? undefined : sprintOf(issue);
      return sprintModel.picker
        .map((entry) => {
          const to = sprintSelectionText(entry.selection);
          return {
            to,
            label: entry.selection.kind === "backlog" ? "Backlog" : `Sprint ${entry.label}`,
          };
        })
        .filter((target) => target.to !== current);
    },
    [state.issues, sprintModel],
  );
  const issueOf = useCallback(
    (key: string) => state.issues.find((issue) => issue.id === key),
    [state.issues],
  );
  // A list row shows the priority being written while its write runs.
  const shownIssue = useCallback(
    (key: string) => {
      const issue = issueOf(key);
      return issue === undefined
        ? undefined
        : { ...issue, priority: edits.shown(key, "priority", issue.priority) };
    },
    [issueOf, edits],
  );
  const renderPriority = useCallback(
    (key: string) => {
      const issue = issueOf(key);
      if (issue === undefined) return null;
      return (
        <PriorityEdit
          issueLabel={issue.displayId ?? key}
          value={edits.shown(key, "priority", issue.priority)}
          disabled={edits.busy(key)}
          onChange={(priority) => setPriority(key, priority)}
        />
      );
    },
    [issueOf, edits, setPriority],
  );
  const renderOwner = useCallback(
    (key: string) => {
      const issue = issueOf(key);
      if (issue === undefined) return null;
      const store = refOf(key).repository;
      const read = owners.of(store);
      return (
        <OwnerPicker
          issueLabel={issue.displayId ?? key}
          owner={edits.shown(key, "owner", issue.assignee ?? "")}
          choices={read?.choices}
          error={read?.error}
          onOpen={() => owners.load(store)}
          onPick={(to) => setOwner(key, to)}
          disabled={edits.busy(key)}
        />
      );
    },
    [issueOf, refOf, owners, edits, setOwner],
  );
  const backlogRows = useMemo(
    () =>
      backlog.rows.flatMap((row) => {
        const issue = state.issues.find((candidate) => candidate.id === row.id);
        return issue === undefined ? [] : [issue];
      }),
    [backlog, state.issues],
  );

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
      for (const target of sprintTargets(selected.id)) {
        list.push({
          id: `sprint:${target.to}`,
          label: `${moveLabel} ${target.label}`,
          detail: name,
          run: () => moveToSprint(selected.id, target.to),
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
    // The single-key shortcut setting (D-12), which the palette carries.
    list.push(shortcutCommand(keymap));
    return list;
  }, [
    selected,
    statusNames,
    navigate,
    move,
    moveToSprint,
    sprintTargets,
    openIssue,
    listStore,
    keymap,
  ]);

  const pending = useMemo(
    () =>
      new Set([
        ...Object.keys(state.pending),
        ...Object.keys(state.ranking ?? {}),
        ...state.issues.filter((issue) => edits.busy(issue.id)).map((issue) => issue.id),
      ]),
    [state.pending, state.ranking, state.issues, edits],
  );
  const repositories = meta?.repositories ?? [];
  const failedReads = reads.filter((read) => !read.ok);

  const setQueueQuery = (query: string) =>
    navigate({ view: "queue", store: listStore, ...(query === "" ? {} : { query }) });

  const detailIssue = detail?.payload?.issue;
  const detailOwner =
    detailIssue === undefined || detail?.payload === undefined
      ? undefined
      : (() => {
          const repository = detail.payload.repository;
          const key = `detail:${repository}:${detailIssue.id}`;
          const read = owners.of(repository);
          return (
            <OwnerPicker
              issueLabel={detailIssue.displayId ?? detailIssue.id}
              owner={edits.shown(key, "owner", detailIssue.assignee ?? "")}
              choices={read?.choices}
              error={read?.error}
              onOpen={() => owners.load(repository)}
              onPick={(to) =>
                edits.edit(key, detailIssue.displayId ?? detailIssue.id, "owner", to, async () => {
                  await api.owner(
                    { id: detailIssue.id, repository },
                    to,
                    detailIssue.assignee ?? "",
                    detailIssue.status,
                  );
                  await reloadDetail();
                })
              }
              disabled={edits.busy(key)}
            />
          );
        })();

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
              navigate({ view: navView, store: event.target.value || undefined })
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
        {feedStale === undefined ? null : (
          <span className="app-stale" role="status">
            {`Live updates stale since ${clockStamp(Date.parse(feedStale), new Date().getTimezoneOffset())}; retrying`}
          </span>
        )}
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
            onReorder={(id, index) => reorder(id, index)}
            sprintTargets={sprintTargets}
            onSprint={moveToSprint}
            renderPriority={renderPriority}
            renderOwner={renderOwner}
            {...(repositoryOf === undefined ? {} : { repositoryOf })}
          />
        )}
        {route.view === "backlog" && (
          <Backlog
            view={backlog}
            issue={shownIssue}
            statuses={statusNames}
            pending={pending}
            issueHref={issueHref}
            onOpen={openIssue}
            onStatus={move}
            onPriority={setPriority}
            sprintTargets={sprintTargets}
            onSprint={moveToSprint}
            renderOwner={renderOwner}
            {...(rank
              ? {
                  onStep: (id: string, delta: -1 | 1) => stepList(backlogRows, id, delta),
                  onDropOnto: (id: string, target: string, below: boolean) =>
                    dropList(backlogRows, id, target, below),
                }
              : {})}
            {...(repositoryOf === undefined ? {} : { repositoryOf })}
          />
        )}
        {route.view === "sprints" && (
          <SprintView
            view={sprintModel}
            mode={sprintMode}
            onMode={setSprintMode}
            onSelect={(selection) =>
              navigate({
                view: "sprints",
                store: listStore,
                query: withParam(listQuery, SPRINT_PARAM, sprintSelectionText(selection)),
              })
            }
            onDropTo={moveToSprint}
          >
            {sprintMode === "board" ? (
              <Board
                view={sprintBoard}
                rank={rank}
                selectedId={selectedId}
                onSelect={setSelectedId}
                issueHref={issueHref}
                onOpen={openIssue}
                onMove={move}
                onReorder={(id, index) => reorder(id, index, sprintModel.list)}
                sprintTargets={sprintTargets}
                onSprint={moveToSprint}
                renderPriority={renderPriority}
                renderOwner={renderOwner}
                {...(repositoryOf === undefined ? {} : { repositoryOf })}
              />
            ) : (
              <Backlog
                view={listView(sprintModel.list)}
                issue={shownIssue}
                statuses={statusNames}
                pending={pending}
                issueHref={issueHref}
                onOpen={openIssue}
                onStatus={move}
                onPriority={setPriority}
                sprintTargets={sprintTargets}
                onSprint={moveToSprint}
                renderOwner={renderOwner}
                {...(rank
                  ? {
                      onStep: (id: string, delta: -1 | 1) => stepList(sprintModel.list, id, delta),
                      onDropOnto: (id: string, target: string, below: boolean) =>
                        dropList(sprintModel.list, id, target, below),
                    }
                  : {})}
                {...(repositoryOf === undefined ? {} : { repositoryOf })}
              />
            )}
          </SprintView>
        )}
        {route.view === "queue" && (
          <>
            <ReadState read={queue} />
            {(queue.data?.reads ?? []).map((read) =>
              read.ok ? null : (
                <p key={read.repository} className="app-error" role="alert">
                  {read.repository}: {read.error.source ?? "the read"} failed: {read.error.message}
                </p>
              ),
            )}
            {queue.data !== undefined && (
              <QueueView
                rows={queue.data.rows}
                order={queue.data.order}
                filters={queueFilters}
                onFilters={(filters: QueueFilters) =>
                  setQueueQuery(withQueueFilters(listQuery ?? "", filters))
                }
                blocked={queueBlocked}
                onBlocked={(blocked) =>
                  setQueueQuery(withParam(listQuery, BLOCKED_PARAM, blocked ? "1" : undefined))
                }
                issueHref={(row) => hrefOf({ view: "issue", id: row.id, store: row.repository })}
                onOpen={(row) => navigate({ view: "issue", id: row.id, store: row.repository })}
              />
            )}
          </>
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
            repository={
              detail?.payload?.repository ??
              detail?.failedIn ??
              route.store ??
              (repositories.length === 1 ? repositories[0] : undefined)
            }
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
            ownerPicker={detailOwner}
          />
        )}
        {route.view === "held" && (
          <HeldDetail
            loading={held.data === undefined && held.error === undefined}
            item={held.data?.item}
            store={held.data?.store}
            body={held.data?.body}
            bodyError={held.data?.bodyError}
            options={held.data?.options}
            optionsError={held.data?.optionsError}
            error={
              held.error === undefined
                ? undefined
                : { source: held.error.source, message: held.error.message }
            }
          />
        )}
        {/* The Review queue, and the composer on a task's detail (client/review.tsx). */}
        {route.view === "review" && <ReviewPage />}
        {route.view === "issue" && detail?.payload !== undefined && (
          <>
            <TaskHandoff id={detail.payload.issue.id} repository={detail.payload.repository} />
            <TaskComposer id={detail.payload.issue.id} repository={detail.payload.repository} />
          </>
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
