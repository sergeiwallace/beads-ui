import {
  type BoardEvent,
  type BoardState,
  backlogView,
  boardView,
  clockStamp,
  commandById,
  EMPTY_FILTER_STATE,
  INITIAL_BOARD_STATE,
  type Priority,
  planMove,
  planRank,
  reduceBoard,
} from "@beads-ui/core";
import {
  Backlog,
  Board,
  CommandPalette,
  IssueDetail,
  type PaletteCommand,
  type ReadFailure,
  useNotify,
  usePaletteChord,
} from "@sergeiwallace/beads-ui-web-ui";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ApiFailure, api, type BoardPayload, type IssuePayload } from "./api.ts";

type Route = { view: "board" } | { view: "backlog" } | { view: "issue"; id: string };

const base = import.meta.env.BASE_URL;
// Wide enough that core's terminal truncation never cuts a title in the browser.
const NO_TRUNCATION = 10_000;

function routeOf(pathname: string): Route {
  const path = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  if (path === "backlog") return { view: "backlog" };
  const issue = /^issues\/(.+)$/.exec(path);
  if (issue?.[1] !== undefined) return { view: "issue", id: decodeURIComponent(issue[1]) };
  return { view: "board" };
}

const hrefOf = (route: Route): string =>
  route.view === "board"
    ? base
    : route.view === "backlog"
      ? `${base}backlog`
      : `${base}issues/${encodeURIComponent(route.id)}`;

const issueHref = (id: string) => hrefOf({ view: "issue", id });

const stamp = () => clockStamp(Date.now(), new Date().getTimezoneOffset());

const failedStale = (event: BoardEvent): boolean =>
  (event.type === "move-failed" || event.type === "rank-failed") && event.exitCode === 13;

function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState(() => routeOf(window.location.pathname));
  useEffect(() => {
    const onPop = () => setRoute(routeOf(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = useCallback((next: Route) => {
    window.history.pushState(null, "", hrefOf(next));
    setRoute(next);
  }, []);
  return [route, navigate];
}

type Meta = Omit<BoardPayload, "issues" | "statuses">;

function useBoard() {
  const [state, dispatch] = useReducer(reduceBoard, INITIAL_BOARD_STATE);
  const [meta, setMeta] = useState<Meta | undefined>(undefined);
  const [writing, setWriting] = useState<ReadonlySet<string>>(new Set());
  const notify = useNotify();
  const latest = useRef<BoardState>(state);
  latest.current = state;
  // Every event goes through here, so a plan made right after one sees the state it made.
  const send = useCallback((event: BoardEvent): BoardState => {
    latest.current = reduceBoard(latest.current, event);
    dispatch(event);
    return latest.current;
  }, []);

  const load = useCallback(async () => {
    try {
      const { issues, statuses, ...rest } = await api.board();
      send({ type: "load-succeeded", issues, statuses, at: stamp() });
      setMeta(rest);
    } catch (error) {
      if (!(error instanceof ApiFailure)) throw error;
      send({
        type: "load-failed",
        ...(error.error.source === undefined ? {} : { command: error.error.source }),
        exitCode: error.error.exitCode ?? null,
        message: error.error.message,
      });
    }
  }, [send]);

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
    for (const id of state.refresh) {
      api.issue(id).then(
        ({ issue }) => send({ type: "issue-refreshed", issue }),
        () => void load(),
      );
    }
  }, [state.refresh, load, send]);

  // A refusal's toast says what core's board view says of it, from the state the refusal made.
  const refused = (event: BoardEvent, title: string) => {
    const next = send(event);
    const line = boardView(next, { columnWidth: NO_TRUNCATION }).conflictLine;
    notify(failedStale(event) ? "conflict" : "error", title, line ?? title);
  };

  const move = (id: string, to: string) => {
    const plan = planMove(latest.current, id, to);
    if (!plan.ok) {
      if (plan.error.kind !== "same-status") notify("error", "Not moved", plan.error.message);
      return;
    }
    const shown = latest.current.issues.find((issue) => issue.id === id)?.status ?? "";
    send(plan.value.event);
    api.move(id, to, shown).then(
      () => send({ type: "move-succeeded", id }),
      (error: unknown) => {
        const failure = error instanceof ApiFailure ? error : undefined;
        const event: BoardEvent = {
          type: "move-failed",
          id,
          exitCode: failure?.exitCode ?? 1,
          message: failure?.message ?? String(error),
        };
        refused(event, failure?.exitCode === 13 ? "Changed elsewhere" : "Move failed");
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
    api.rank(id, shown, above, below).then(
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
      .priority(id, priority, shown)
      .catch((error: unknown) => {
        const failure = error instanceof ApiFailure ? error : undefined;
        if (failure?.exitCode === 13) {
          notify(
            "conflict",
            "Changed elsewhere",
            `${id} changed before the priority was written; re-read`,
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

  return { state, meta, writing, move, reorder, setPriority };
}

interface DetailRead {
  id: string;
  payload?: IssuePayload;
  error?: ReadFailure;
}

function useIssue(id: string | undefined): DetailRead | undefined {
  const [read, setRead] = useState<DetailRead | undefined>(undefined);
  useEffect(() => {
    if (id === undefined) return;
    let live = true;
    setRead({ id });
    api.issue(id).then(
      (payload) => live && setRead({ id, payload }),
      (error: unknown) => {
        if (!live) return;
        const failure = error instanceof ApiFailure ? error.error : undefined;
        setRead({
          id,
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
  }, [id]);
  return read?.id === id ? read : undefined;
}

export function App() {
  const [route, navigate] = useRoute();
  const { state, meta, writing, move, reorder, setPriority } = useBoard();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const rank = meta?.rank ?? false;
  const detail = useIssue(route.view === "issue" ? route.id : undefined);

  usePaletteChord(useCallback(() => setPaletteOpen(true), []));

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
        run: () => navigate({ view: "issue", id: selected.id }),
      });
    }
    list.push(
      { id: "go:board", label: "Go to Board", run: () => navigate({ view: "board" }) },
      { id: "go:backlog", label: "Go to Backlog", run: () => navigate({ view: "backlog" }) },
    );
    return list;
  }, [selected, statusNames, navigate, move]);

  const pending = useMemo(
    () => new Set([...Object.keys(state.pending), ...Object.keys(state.ranking ?? {}), ...writing]),
    [state.pending, state.ranking, writing],
  );

  return (
    <div className="app">
      <header className="app-bar">
        <span className="app-store" title="The Beads store this server reads">
          {meta?.store ?? "beads-ui"}
        </span>
        <nav className="app-nav" aria-label="Views">
          <a
            href={hrefOf({ view: "board" })}
            aria-current={route.view === "board" ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              navigate({ view: "board" });
            }}
          >
            Board
          </a>
          <a
            href={hrefOf({ view: "backlog" })}
            aria-current={route.view === "backlog" ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              navigate({ view: "backlog" });
            }}
          >
            Backlog
          </a>
        </nav>
        <span className="app-stamp">{board.asOf ?? ""}</span>
        <button
          type="button"
          className="bu-button app-palette"
          onClick={() => setPaletteOpen(true)}
        >
          Commands <kbd>Ctrl K</kbd>
        </button>
      </header>
      {board.errorLine !== undefined && (
        <p className="app-error" role="alert">
          {board.errorLine}
        </p>
      )}
      {(meta?.problems ?? []).map((problem) => (
        <p key={problem} className="app-problem">
          beads-ui.toml: {problem}
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
            onOpen={(id) => navigate({ view: "issue", id })}
            onMove={move}
            onReorder={reorder}
          />
        )}
        {route.view === "backlog" && (
          <Backlog
            view={backlog}
            issue={(id) => state.issues.find((issue) => issue.id === id)}
            statuses={statusNames}
            pending={pending}
            issueHref={issueHref}
            onOpen={(id) => navigate({ view: "issue", id })}
            onStatus={move}
            onPriority={setPriority}
          />
        )}
        {route.view === "issue" && (
          <IssueDetail
            loading={detail?.payload === undefined && detail?.error === undefined}
            issue={detail?.payload?.issue}
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
            issueHref={issueHref}
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
