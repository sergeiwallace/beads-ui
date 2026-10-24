---
title: "An older host refresher keeps its lease across a plugin upgrade"
category: bug
tags: [bug, refresher, band]
status: open
template_version: "bug-1.0.0"
---

<!-- doc:region name="summary" kind="replaceable" -->

# BU-4af: an older host refresher keeps its lease across a plugin upgrade

## Founding Ask Coverage

Non-authoritative index. The task is Beads BU-4af (child of BU-ylx.6). The founding ask quoted in
the delegating brief is about the band's text: `[bd] {N} tasks (...)` instead of
`beads aih-ec2-3, all 9 stores ...`, the "as of" stamp only in debug mode, and a beads-ui task
panel that replaces the Claude Code one. This fix does not change any of those. The band format
and the debug-only stamp are already what builds 0.9.x draw (`hooks/bands.test.ts`, the `OWN`
line; `core/src/views/band.ts`, `asOf` in debug only). A session that still shows the old text is
running an older build's code, which is the same upgrade skew this bug is about, on the session
side rather than the refresher side. The task panel is Phase 2B work and is not touched here.

**Status:** open (fix in review; aih-ec2-3 merges, installs and runs the live check)

**Severity:** P1

**Created:** 2026-10-24

**Task:** BU-4af

## Table of Contents

- [Founding Ask Coverage](#founding-ask-coverage)
- [Symptoms](#symptoms)
- [Environment](#environment)
- [Reproduction Steps](#reproduction-steps)
- [Root Cause Analysis](#root-cause-analysis)
- [Prior Fix Attempts](#prior-fix-attempts)
- [Fix](#fix)
- [Verification](#verification)
- [Lessons Learned](#lessons-learned)

## Symptoms

After the plugin was upgraded to 0.9.3, the only host refresher on sem-kg-ec2 was still the one
started from the 0.4.0 cache (pid 545026, started 13:00:49Z). It writes only
`~/.local/state/beads-ui/counts.json`. Builds 0.9.2 and later read only `counts-<token>.json` for
the token `lease.json` names, so a session restarted on 0.9.3 finds a live lease and no snapshot
it will read. `supervise` then answers `direct`: the session reads all 9 stores itself every
minute and marks its band line `*`. That is the per-session cost the refresher exists to remove
(D-26).

## Environment

- Host sem-kg-ec2, plugin cache `/data/claude/plugins/cache/beads-ui/beads-ui/` holding 0.1.0
  to 0.9.3, installed build 0.9.3.
- Live state measured 2026-10-24 ~20:52Z: `lease.json` and `lease-<token>.json`
  share an inode (link count 2), record `{"token":"<token>","pid":545026,...}`
  with no build, and no `counts-<token>.json` exists.
- Node 24.21.0, Claude Code 2.1.310.

## Reproduction Steps

1. In a state directory, write `lease.json` as builds before 0.9.4 write it, with no build and a
   fresh heartbeat, and `counts.json` under that token, as builds before 0.9.2 publish it.
2. Start the current refresher with a new token.
3. Observe at base 2cc0dcb: it finds the lease live and exits; the lease still names the old
   token, and no `counts-<token>.json` exists for any session to read.
4. Start a session (the hooks test world) whose refresher lease is live but whose token has no
   `counts-<token>.json`. Observe at base: it starts no refresher and runs every `bd count` itself.

The regression tests below automate both halves.

## Root Cause Analysis

The lease is the only thing that decides which refresher runs, and it carried no build. A
refresher takes the lease only when it is stale (`FileLease.acquire`: a fresh, readable holder
means `break`), and a session starts a refresher only when none is running (`supervise`:
`running` answers `snapshot` or `direct` before any start is considered). So a refresher, once
running, keeps the lease for as long as any session registers, whatever build it is, and nothing
on a newer build has a way to replace it.

Before 0.9.2 that was harmless, because every build read and wrote the same `counts.json`. PR #58
(0.9.2) made each refresher write `counts-<token>.json` and made sessions read only the file of
the token the lease names, so an ousted refresher could never pass for the holder. That change
was right on its own terms, but it made the snapshot format depend on the build, and the lease
still did not say which build held it. From then on, an older refresher surviving an upgrade
means newer sessions see a running refresher and no snapshot.

Hypotheses ruled out:

| Hypothesis | Why it was ruled out |
|---|---|
| The 0.4.0 refresher is hung, so its lease should already be stale | `lease.json` beatAt was renewed within the last 20 s at measurement; the process answers its renewals. |
| A session reading `counts.json` as a fallback would be enough | It removes the direct reads but keeps the 0.4.0 refresher, its logic and its file format, running for as long as sessions register, so "one refresher of the installed version" never happens. It also re-opens the ousted-writer hole PR #58 closed. Rejected. |
| Killing the old refresher from a newer session | Needs a signal sent across builds to a pid read from a file, which can name a reused pid, and leaves a gap until the next start. The lease already gives an atomic, inode-checked handover that every older build obeys. Rejected. |

## Prior Fix Attempts

| # | Date | What was tried | Outcome |
|---|------|----------------|---------|
| 1 | 2026-10-24 | The fix below, first attempt | Green; no failed attempts |

## Fix

The design choice: the lease records the build, and a later build supersedes a live older lease
through the same atomic takeover a stale lease already uses. The incoming refresher publishes the
last snapshot under its own token before it takes the lease, so there is no beat during which
sessions find no snapshot.

- `core/src/snapshot.ts`: `FileLease.version`, read by `parseFileLease`; `MANIFEST_PATH`;
  `buildOf` (the `major.minor.patch` a manifest names); `laterBuild` (a lease with no build, or
  one it cannot read, is older than any build; a refresher or session that cannot read its own
  build supersedes nothing). `supervise` takes `outdated`: a running refresher of an older build
  gets a start under a free `$.store` lease, the older snapshot is drawn meanwhile if there is
  one, and otherwise the session waits `START_GRACE_MS` as for any start.
- `refresher/refresher.mjs`: reads its build from `../.claude-plugin/plugin.json` and writes it
  in its lease record. `acquire` breaks on a live holder only when this build is not later than
  the holder's. Before acquiring, `seed` writes the live `counts.json` stores and heartbeat as
  `counts-<own token>.json` (boards left out, since their files are the old refresher's); a
  refresher that loses the race removes that file. A 0.9.2 or 0.9.3 holder drops another token's
  counts once their heartbeat is 50 s old, and the seed carries the old heartbeat, so a holder
  publishing in the instant before the takeover can remove it; the new holder writes it again
  right after taking the lease. One gap remains: that older holder checks it still holds the
  lease and then removes the file, and if the takeover lands between those two steps, which
  takes microseconds, the seed is gone until the new holder's first beat (at most 28 s). In that
  case sessions whose minute check falls in that time read their stores themselves once. It needs
  a 0.9.2 or 0.9.3 holder; the live 0.4.0 one removes no other token's files. Stamping the seed
  with the new heartbeat would close it, at the cost of a seed that looks fresher than its counts
  are; the stores' own `readAt` keep their real age either way.
- Review fix: a session whose replacing start failed now tries again once its plugin-store lease
  expires, as a failed start already did when no refresher ran. Without this, one failed launch
  left the older refresher in place for the life of that session.
- `hooks/tally.ts`: reads the session's build once from `$.plugin.root`'s manifest and passes
  `outdated` to `supervise`.
- The old refresher needs no change. Every cached build that ships a refresher (0.3.0 to 0.9.3,
  read in `/data/claude/plugins/cache/beads-ui/beads-ui/`) checks before each renewal, read and
  write that `lease.json` is still its own (0.3.0 by token, 0.4.0 on by inode) and quits when it
  is not. Builds before 0.3.0 ship no refresher.
- Equal builds never supersede each other, and a session never starts an older build over a
  newer one, so two builds cannot take turns.
- Plugin version 0.9.3 to 0.9.4.

Why not "snapshot reading stays compatible": a compatible read stops the direct reads, but the
0.4.0 process keeps running and keeps counting with 0.4.0 logic until no session registers for
five minutes, which on a busy host is never. The done-when asks for one refresher of the
installed build.

## Verification

Regression tests, written before the fix and unchanged after it:

- `plugins/beads-ui/test/refresher.spec.ts`
  - "should take over the live lease of an older build's refresher, its last snapshot current
    under the new token from the moment the lease names it" (the 0.4.0 file shapes: a lease with
    no build, `counts.json` only; a hung store holds the first beat back, so what is current at
    takeover is the seed)
  - "should leave an older build's refresher no lease, so it stops reading and exits, once a
    newer build's refresher starts" (two real processes; the older one is this refresher with no
    manifest beside it, so it records no build, as every build before 0.9.4 did)
  - "should start nothing and read nothing when a live refresher of build its own / 999.0.0
    holds the lease" (the negative constraint)
- `plugins/beads-ui/hooks/bands.test.ts`, "one refresher for the host (T-1B.4)"
  - "should start a refresher of its own build and read nothing itself when the running
    refresher is an older build that writes no snapshot under its token"
  - "should start a refresher of its own build and draw the older one's snapshot meanwhile when
    the running refresher records no build"
  - "should start nothing when the running refresher is build 0.9.4 / 0.10.0 and the session
    0.9.4" (`0.10.0` fails a string compare)
  - "should wait, reading nothing itself, while another session starts the refresher that
    replaces an older build"

RED at base 2cc0dcb with the tests applied: `npx vitest run test/refresher.spec.ts -t build`, 2
failed (both takeover tests: the lease still named the old token), 2 passed (the negative ones);
`claude plugin test .`, 577 pass, 3 fail (the two start tests, `Expected: length 1, Received:
length 0`, and the wait test, which ran the session's own `bd count`s).

GREEN at head: `npx vitest run test/refresher.spec.ts`, 25 passed; `claude plugin test .`, 580
pass, 0 fail; `npx vitest run`, 29 files, 401 passed; `npm run lint` and `npx tsc --noEmit`
clean.

One existing test's fixture changed with the tests: "should take over, by default, the lease of a
killed refresher once it is 50 seconds unrenewed and not before" now writes its killed lease with
the current build. Without it, that lease reads as an older build's and is rightly superseded at
40 s, which is not what that test is about.

- [x] Old lease and old snapshot format, new refresher: takes over, snapshot current at once
- [x] Real older process exits and stops calling `bd` once superseded
- [ ] Live on sem-kg-ec2 after merge and install: one refresher of 0.9.4 serves every restarted
      session from its snapshot (aih-ec2-3 verifies; pid 545026 was left running on purpose)

Live unknown: the session reads its manifest with `$.fs.read` under `$.plugin.root`. If the
engine refuses that path, `outdated` is never true and a session never starts the takeover; a
0.9.4 refresher started for any other reason still takes over. The live check should confirm a
restarted 0.9.4 session starts one.

## Lessons Learned

A change to a file another process writes needs a rule for the build that wrote it. PR #58 changed
which file sessions read without a way for sessions or refreshers to tell an old writer from a
current one; its tests ran both sides from the same build, so the skew could not show. The lease
now names the build, and the refresher spec runs an older-build process beside the current one.

<!-- /doc:region name="summary" -->

<!-- doc:region name="reproduction" kind="replaceable" -->

<!-- /doc:region name="reproduction" -->

<!-- doc:region name="root_cause" kind="replaceable" -->

<!-- /doc:region name="root_cause" -->

<!-- doc:region name="fix_log" kind="append_only" -->

| Date | Commit | Change |
|---|---|---|
| 2026-10-24 | this branch | Lease records the build; a later build supersedes a live older lease after seeding its own snapshot; sessions start the takeover; 0.9.4 |
| 2026-10-24 | this branch | Codex review (gpt-5.6-sol): retry a failed replacing start once its lease expires; new test RED (1 fail of 581), then GREEN (581/581) |

<!-- /doc:region name="fix_log" -->

<!-- doc:region name="appendix_evidence" kind="immutable" -->

<!-- /doc:region name="appendix_evidence" -->
