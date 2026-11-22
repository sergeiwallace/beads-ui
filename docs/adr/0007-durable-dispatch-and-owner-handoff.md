# 0007. Durable dispatch and owner handoff

## Status

Accepted.

## Context

Carriers and the receiving session can act independently of the web
request. The queue stores events by task. Beads claim takeover has
different guards from an ordinary assignee update.

## Decision

- `apps/web/server/dispatch-store/` separates bodies from the journal
  and queue prompt rows. The local journal backs hosts without
  `queue.url`. The queue-backed store indexes dispatch IDs to tasks.
  Both use the core's entry fold for identical state rules. Backups of
  the records hold pointers and no bodies. Expiry tombstones the body.
  A replay can repeat an append after a receipt and must preserve it.
- `apps/web/server/dispatch-ladder.ts` coalesces per session from the
  first admitted dispatch, after its bd work. An hourly cap or a paused
  goal holds delivery. It tries Agent Mail, Buzz and git-inbox, then
  the configured local wakes after a shown deadline and finally
  turn-end pickup. Policies and tools are read at call time. A carrier
  may truncate a subject to 60 characters, so a shown receipt for any
  carried ID covers its event. A receipt can arrive before the carrier
  process exits. Pending windows and shown deadlines are reconstructed
  from durable dispatches at restart. The UI retains the proof for
  each state change and records a refused transition without throwing.
- `apps/web/server/dispatch.ts` distinguishes failed held subprocess
  reads from an empty queue. It mirrors signed actions to Beads. The
  comment retains a full resolution because the fleet's `bd-unblock`
  accepts only one line in `--why`.
- `apps/web/server/owner-handoff.ts` uses fleet liveness and a
  receiver-first transfer. A live holder performs its own handoff.
  Unknown liveness leaves the issue alone. A proved-gone holder uses
  bd's force path, which accepts a status guard but no assignee guard.
  Reread the holder immediately before the force write. Record the
  handoff before releasing the claim. Retry a failed send to the same
  receiver from that record without another release. Git-inbox carries
  a pointer. A read from a shared database may precede publication, so
  only the holder's sent receipt proves publication and a successful
  verify receipt proves completion.

## Consequences

Server tests stand in for the fleet tools and check their real argument
contracts, including the carrier target, git-inbox body or action,
file-based wake/submit text, fleet liveness JSON and host wake policy.
The queue fixture follows the queue's UUID, ISO timestamp and FastAPI
error shapes and its 200-event task-detail cap. The receiver side's
golden vectors fix the signing bytes.
