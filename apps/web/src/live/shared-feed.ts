// One Server-Sent Events connection per browser, shared by every tab of the app (web app design
// T-W3.1). The tab holding a Web Lock opens the stream and passes each event on over a
// BroadcastChannel; every other tab waits on the same lock, so when the holding tab closes the
// browser grants it to one of them at once and that tab opens the stream. A browser with neither
// API gives each tab its own stream.

/** What the server's change feed pushes (server/heads-feed.ts FeedEvent). */
export type FeedMessage =
  | { type: "change"; data: { stores: string[]; asOf: string } }
  | { type: "stale"; data: { since: string; message: string; retryInMs: number } };

export type FeedListener = (message: FeedMessage) => void;

/** Whether this tab holds the stream, or is sent its events by the tab that does. */
export type FeedRole = "holder" | "follower" | "alone";

export interface FeedPlatform {
  locks?: Pick<LockManager, "request"> | undefined;
  channel?: ((name: string) => BroadcastChannel) | undefined;
  eventSource(url: string): EventSource;
}

const FEED_TYPES = ["change", "stale"] as const;

export interface SharedFeed {
  subscribe(listener: FeedListener): () => void;
  role(): FeedRole;
}

/**
 * Starts the shared feed for the app at `eventsUrl`. `name` keys the lock and the channel, so two
 * apps on one origin (two base paths) never share a stream.
 */
export function createSharedFeed(
  eventsUrl: string,
  name: string,
  platform: FeedPlatform,
  onRole: (role: FeedRole) => void = () => undefined,
): SharedFeed {
  const listeners = new Set<FeedListener>();
  const deliver = (message: FeedMessage) => {
    for (const listener of [...listeners]) listener(message);
  };
  let role: FeedRole = "alone";
  const setRole = (next: FeedRole) => {
    role = next;
    onRole(next);
  };

  const open = (relay: (message: FeedMessage) => void): EventSource => {
    const source = platform.eventSource(eventsUrl);
    for (const type of FEED_TYPES) {
      source.addEventListener(type, (event) => {
        const message = { type, data: JSON.parse((event as MessageEvent<string>).data) };
        deliver(message as FeedMessage);
        relay(message as FeedMessage);
      });
    }
    return source;
  };

  const channel = platform.channel?.(name);
  if (platform.locks === undefined || channel === undefined) {
    setRole("alone");
    open(() => undefined);
  } else {
    setRole("follower");
    channel.onmessage = (event: MessageEvent<FeedMessage>) => deliver(event.data);
    // Held for the life of the tab: the promise never settles, so the lock is released only
    // when the tab goes away, and the next waiting tab is granted it.
    void platform.locks.request(
      name,
      () =>
        new Promise<never>(() => {
          setRole("holder");
          open((message) => channel.postMessage(message));
        }),
    );
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    role: () => role,
  };
}

let shared: SharedFeed | undefined;

/**
 * The page's shared feed, started on first use: the stream at `<base>api/events`. The page's root
 * element carries `data-feed-role` and `data-feed-seen` (events delivered to this tab).
 */
export function pageFeed(base: string): SharedFeed {
  if (shared !== undefined) return shared;
  const root = document.documentElement;
  const browser = globalThis as typeof globalThis & { BroadcastChannel?: typeof BroadcastChannel };
  shared = createSharedFeed(
    `${base}api/events`,
    `beads-ui-feed:${location.origin}${base}`,
    {
      locks: typeof navigator !== "undefined" ? navigator.locks : undefined,
      channel:
        browser.BroadcastChannel === undefined ? undefined : (name) => new BroadcastChannel(name),
      eventSource: (url) => new EventSource(url),
    },
    (role) => {
      root.dataset.feedRole = role;
    },
  );
  let seen = 0;
  root.dataset.feedSeen = "0";
  shared.subscribe(() => {
    seen += 1;
    root.dataset.feedSeen = String(seen);
  });
  return shared;
}
