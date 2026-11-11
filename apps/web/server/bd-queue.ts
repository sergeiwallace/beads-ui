// One queue of bd calls per store (beads-ui design, the bd-node adapter). An
// embedded store runs one bd process at a time, so calls the server starts side by side wait on
// the store's lock inside bd, and that wait counted against bd-node's 10-second call timeout: on a
// loaded host a view's read timed out behind the app's own Board read. Here each call starts only
// after the store's earlier calls have settled, so its timeout covers its own run alone.

import { AsyncLocalStorage } from "node:async_hooks";
import type { BdClient } from "@sergeiwallace/beads-ui-bd-node";

/** The signal of the HTTP request a call is made for: it aborts when the client goes away. */
export const requestScope = new AsyncLocalStorage<AbortSignal>();

/** `[web] bd_queue_wait_seconds` when unset: how long a call may wait for the store's earlier ones. */
export const DEFAULT_QUEUE_WAIT_SECONDS = 60;

/** The calls that change a store; every other call is a read. */
const WRITES = new Set<string>(["update", "create", "close", "comment"]);

const failed = (message: string) => ({
  kind: "failed" as const,
  exitCode: null,
  stderr: "",
  message,
});

/**
 * `bd` with its calls run one after another, in the order they were made. A call that has waited
 * `waitMs()` without starting answers a failure naming the wait, and never runs. A read whose HTTP
 * request was abandoned before it started is dropped; a write still runs, in its place in line.
 */
export function queuedBd(bd: BdClient, waitMs: () => Promise<number>): BdClient {
  let tail: Promise<unknown> = Promise.resolve();
  return new Proxy(bd, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      const name = `bd ${String(property)}`;
      const isRead = !WRITES.has(String(property));
      return (...args: unknown[]) => {
        const signal = isRead ? requestScope.getStore() : undefined;
        return new Promise((resolve, reject) => {
          let state: "waiting" | "started" | "done" = "waiting";
          let timer: NodeJS.Timeout | undefined;
          const onAbort = () => giveUp(`${name} did not run: its request was abandoned`);
          const giveUp = (message: string) => {
            if (state !== "waiting") return;
            state = "done";
            if (timer !== undefined) clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            resolve(failed(message));
          };
          if (signal?.aborted) onAbort();
          else signal?.addEventListener("abort", onAbort, { once: true });
          void waitMs().then((ms) => {
            if (state !== "waiting") return;
            timer = setTimeout(
              () =>
                giveUp(`${name} waited ${ms} ms for this store's earlier bd calls and did not run`),
              ms,
            );
          });
          const turn = tail.then(async () => {
            if (state !== "waiting") return;
            state = "started";
            if (timer !== undefined) clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            try {
              resolve(await value.apply(target, args));
            } catch (error) {
              reject(error);
            }
          });
          tail = turn;
        });
      };
    },
  });
}
