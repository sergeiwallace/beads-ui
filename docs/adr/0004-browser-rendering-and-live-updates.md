# 0004. Browser rendering and live updates

## Status

Accepted.

## Context

The browser reuses models that budget text for a terminal, renders a
third-party Gantt chart, and can hold a long-lived event stream across
several tabs. Slow reads can overlap a write, a later poll or shutdown.

## Decision

- `apps/web/client/App.tsx` gives the browser enough title width to avoid
  terminal truncation. Events update the state used to plan the next
  action immediately. It keeps sprint selection as URL text to avoid
  rerunning work for a fresh object with the same identity. Views that
  require one store ask for a selection when several are open. A refused
  leased move reports the queue's authoritative status.
- `apps/web/client/main.tsx` imports the default Trusted Types policy
  before modules can reach a sink. The Gantt library uses `innerHTML`,
  so the policy sends HTML through DOMPurify. A null script or script-URL
  result makes the sink throw. Issue Markdown uses image alt text without
  fetching remote image sources.
- `apps/web/server/csp.ts` permits a same-origin `<base>` because browsers
  discard it under `base-uri 'none'`. `packages/web-ui/src/Roadmap.tsx`
  uses numeric Gantt IDs because Frappe interpolates IDs into CSS selectors
  without escaping hierarchical issue IDs. Keep one class per
  `classList.add` call. The Vite alias points to the stylesheet itself
  because the package's style condition follows its script condition.
  Frappe 1.2.2 supplies no declarations, so the app declares what it uses.
- The Board card is the drag source. A link's native drag would carry its
  URL. Every drag has a single-pointer action under WCAG 2.2 2.5.7.
- `apps/web/src/live/shared-feed.ts` keeps one stream using a Web Lock
  whose callback stays pending for the tab's lifetime. BroadcastChannel
  relays events to other tabs, and the next lock holder takes over when
  the current tab closes. Without the browser APIs each tab uses its own
  stream. The page keeps periodic refresh as a stream fallback.
- `apps/web/server/heads-feed.ts` finds a shared Dolt port beside its
  metadata. It retries individual stores when one absent database would
  fail the batched query. It advances heads after refreshing all moved
  stores, so a failed poll retries them. It starts no bd calls after
  losing the last subscriber. Cache invalidation surrounds writes so a
  concurrent read cannot leave an older board cached. Analytics keys
  issue history to `updated_at`; bd import preserves that issue's
  creation date while stamping a current creation event.
- Stop ends streams first and refuses EventSource reconnects because a
  reconnect could hold the listener open. It drains handlers, including
  those whose clients disconnected, so no bd write survives server
  shutdown. A disconnected client's queued read can be dropped before it
  starts. The server cuts lingering connections at its deadline.

## Consequences

Read Gantt positions from the SVG, since Frappe can scroll between
viewport measurements. Click the bar's group because its label covers
the bar. The browser tests exercise these behaviors alongside the server's
stream and shutdown tests.
