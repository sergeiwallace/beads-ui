---
title: "Repeated Codex companion launches create duplicate panes"
category: bug
tags: [bug]
status: draft
source: "native Codex delegation"
template_version: "bug-1.0.0"
task: BU-c7r
stub: false
---

# Repeated Codex companion launches create duplicate panes

## Founding Ask Coverage

`founding_ask_ref`: N/A. Contained implementation delegation with no canonical root JSON supplied.

Exact load-bearing initial delegation:

```text
Bounded first phase: read canonical bug-fix/root-cause-and-fix procedure and repo conventions; reproduce duplicate companion launch using real isolated tmux server and registered test processes where available, diagnose launch.mjs unconditional split. Add smallest meaningful regression test for repeated/concurrent invocation on exact same session+composer that asserts one companion and unchanged active pane; also guard distinct sessions/composers. Do NOT edit production before confirmed RED.
```

The coordinator accepted the reproduced RED and authorized the contained Linux flock-backed fix under the existing parent task.

**Status:** draft

**Created:** 2026-11-16

<!-- doc:region name="summary" kind="replaceable" -->

## Table of Contents

- [Summary](#summary)
- [Reproduction](#reproduction)
- [Root Cause](#root-cause)
- [Fix Log](#fix-log)
- [Appendix: Evidence](#appendix-evidence)

## Summary

Repeated or concurrent launcher calls created another companion for the same composer and session.
The launcher now serializes discovery and creation, then reuses a live pane with matching ownership metadata.
This is a Linux-only companion adapter, not an embedded Codex component. Installation and full parent acceptance remain pending.

<!-- /doc:region name="summary" -->

<!-- doc:region name="reproduction" kind="replaceable" -->

## Reproduction

Base HEAD: `0f80e89`, plus the existing staged companion implementation. Environment: fw-lnx, Node 22.23.1, tmux 3.7c.
The new regression exercises a real isolated tmux server, real launcher processes, rendered companion readiness, and fixture bd data.

Run from `apps/terminal`:

```bash
BEADS_UI_TEST_JOBS=1 timeout 65 npx vitest run test/launch-lifecycle.test.ts
```

Before production edits: two failures and one pass in 2.39 seconds. Both repeated and concurrent identical calls returned `%1` then `%2`, leaving three panes instead of two.
Distinct session/composer bindings remained separate; focus stayed on the original composer.
Frozen test SHA256: `3ed0175ee2dd22dbcba47fc1d7c1946e8310c645fef89e8253274c065f625337`.
No live session was exercised or typed into.

<!-- /doc:region name="reproduction" -->

<!-- doc:region name="root_cause" kind="replaceable" -->

## Root Cause

Each invocation unconditionally called `split-window`. No binding identity, discovery step, or serialization existed.
A resume or duplicate trigger therefore created another live terminal process. Existing tests covered only one launch.
The observed panes rendered successfully, rejecting child startup failure as the explanation.

The contained fix hashes the canonical repository, session, exact composer, and resolved tmux server identity.
A private temporary lock file is held by Linux `flock`; acquisition waits at most five seconds.
The worker has an eight-second OS deadline, and the lock is not inherited by the companion.
Lock files are intentionally retained outside the source tree to avoid inode replacement races.
Kernel ownership releases the lock when its holder exits; no persistent tmux semaphore is used.

The first locking implementation used `flock -o`, which closed the lock descriptor in the timeout/worker subtree.
An isolated production-path reproduction delayed the first real split reply, killed only the owned direct lock supervisor,
and then launched the same binding again. Both `%1` and `%2` acquired identical ownership metadata.
The original killed-holder test exercised `flock -F sleep`; it did not cover this production supervision topology.

A separate deterministic regression now gates the actual split reply and kills the direct outer supervisor.
It confirms the mutation worker remains alive before and after a nonblocking external kernel-lock probe.
Unfixed behavior: the probe acquired the lock (exit 0), where exclusion requires exit 1.
After releasing the gate, the regression checks real retry reuse and unchanged composer focus.
Frozen test: `apps/terminal/test/launch-holder-death.test.ts`, SHA256
`a6392a5430ea64350cc8ebb5a8f3c0185dbbae37e70f851f87f6b6232814a61a`.
The earlier timing-based candidate `d45129…` was retired because it could pass unfixed under scheduling variation.
A SIGSTOP variant introduced worker termination rather than isolating lock lifetime; the final test uses the IPC gate instead.

The smallest correction removes only `-o` and updates the ownership comment.
The supervisor, timeout, and mutation worker retain the lock until their descriptors close.
The five-second acquisition limit and eight-second inner execution deadline are unchanged.
Node subprocess defaults prevent forwarding the lock descriptor into tmux; repeated-launch reuse tests pass while the companion remains alive.
No deadline-budget expansion, replacement lock architecture, or new runtime dependency was introduced by this correction.

Discovery validates a single matching pane, a live-pane flag, and its recorded process identity.
A stale or ambiguous binding fails closed and never kills or repurposes another pane.
Creation stays detached and never selects a pane or sends keys.
Missing locking binaries, unsafe lock files, and timeouts fail without taking an unlocked creation path.

This changes one cohesive component, no existing CLI arguments, and no repository boundary.
A local reversible fix therefore suffices; a new cross-platform locking service would broaden the ownership boundary unnecessarily.
No npm or native package dependency was added. Linux `flock` and `timeout` are explicit runtime requirements.

Fresh terminal verification after restoring the fix: all 13 tests across five files passed in 9.88 seconds.
Root `npx tsc --noEmit`, focused Biome checks, and `git diff --check` passed for that initial fix.
The supervisor-death correction separately passed its new focused test; restoring `-o` reproduced the sole expected kernel-lock failure, then fixed bytes were restored.
After restoration, all 14 terminal tests across six files passed in 13.57 seconds. Root TypeScript, focused Biome, and diff checks passed.
Additional cases cover unavailable flock, bounded lock contention, recovery after killing the owned lock holder,
and refusal to reuse a pane whose process was replaced. The original frozen regression remains unchanged.

A third defect left companions alive after their composer disappeared or its pane was respawned.
The frozen `companion-self-cleanup.test.ts` (SHA256
`e25efcbac37d625ea8d92887a82e312cfb5d0619c9134d4bf1c0dd757acb5558`)
first reproduced all four failures. The companion now polls actual tmux pane membership and Linux
process start times every 500 ms. Server PID/start, composer pane/PID/start, and socket identity
are captured at launch and recorded without changing the binding digest algorithm.
Reuse refuses a stale incarnation; only the companion exits itself when a successful inventory
proves its composer absent or replaced. Failed command/process reads, including startup reads,
remain unknown and retain the companion. Self-ownership must be verified before changing only
its own pane's `remain-on-exit` to off; no foreign pane is killed or respawned.
Disabling only CLI monitor wiring reproduced all four RED cases in 15.49 seconds; restored wiring
passed the four cases plus the original holder-death regression. The latter also caught a startup
probe failure initially being treated as fatal; startup now retries unknown reads safely.

Fresh restored verification passed all 18 terminal tests across seven files in 16.82 seconds.
Root TypeScript, focused Biome, diff checks, and canonical document validation passed.
All three frozen regression hashes remain unchanged.

A fourth regression kills the actual mutation worker after a successful real split but before
ownership publication. The live unmarked companion survived; retry originally returned `%2`
instead of `%1`, leaving three panes. Frozen `launch-mutator-death.test.ts` SHA256:
`27858c0f11184c15d9f584a514832d445c7763cf1638808caf4638c972c40e0e`.
Linux recovery now inspects only live, completely unmarked panes under the same binding lock.
It requires exact NUL-separated argv matching the trusted Node executable, CLI path, canonical
repository, session, and immutable lifecycle args. Linux start times bracket command reads;
tmux server/start membership must match. Multiple matches and mismatched lifecycle ownership
fail closed. Publication is guarded by current pane PID and empty ownership metadata, then
process start/argv and the resulting metadata are checked again. This is companion ownership
recovery, not an author authentication or provenance boundary. tmux does not expose Linux
start time to its atomic format guard; surrounding process checks supplement that PID guard.
No foreign pane is killed, respawned, or relabeled by this path.

Before recovery changes, a second behavioral file reproduced ambiguous-candidate acceptance
and confirmed that a Node process merely containing companion arguments remained untouched.
Frozen `launch-recovery-ownership.test.ts` SHA256:
`eb9c0fca8a4b8de3f104687a9f18230871c22c076fd3f92431bdb02c0c0f8729`.
Disabling only recovery reproduced all three expected crash-case assertion failures in 855 ms;
restoration passed all 21 terminal tests across nine files in 19.30 seconds. Root TypeScript,
focused Biome, diff checks, and canonical document validation passed. All frozen files remain
unchanged. The older full-repository run is not post-recovery validation.

Full repository verification and integration remain coordinator-owned. Mac portability,
installation/adoption, and real user-session acceptance remain follow-ups.
No unrelated-pane cleanup is attempted. Local Mac display acceptance was not tested.

<!-- /doc:region name="root_cause" -->

<!-- doc:region name="fix_log" kind="append_only" -->

## Fix Log

| Date | Commit | Notes |
|------|--------|-------|
| 2026-11-16 | Uncommitted | Native implement worker followed canonical bug-fix gates; reproduced and froze RED before production changes. Contained Linux locking selected by coordinator ruling. |
| 2026-11-16 | Uncommitted | Added serialized binding discovery/creation and ownership validation; terminal suite 13/13 passed. Disabled-fix RED reconfirmed, fixed bytes restored, and fresh 13/13 GREEN earned with root TypeScript and focused Biome passing. Repository hard gate and integration not claimed. |

| 2026-11-16 | Uncommitted | Reproduced production supervisor-death duplicate, replaced flaky timing candidate with frozen kernel-invariant regression, and removed only `-o`. New focused GREEN; reintroduced `-o` yielded expected RED (exit 0 versus required lock refusal 1); restored corrected bytes. Full-repository baseline predates this correction and is not post-fix validation. |

| 2026-11-16 | Uncommitted | Added Linux composer-incarnation self-monitor and own-pane remain-on-exit override after frozen four-case RED. Disabled monitor repeated four RED failures; restored monitor passed cleanup and holder-death cases. Startup unknown reads retain and retry. |

| 2026-11-16 | Uncommitted | Added exact-argv Linux recovery for an unmarked companion surviving mutation-worker death after frozen RED; ambiguous candidates fail closed and unrelated lookalike argv is preserved. Recovery-disabled RED reproduced; restored terminal suite21/21, TypeScript/Biome/diff/doc checks passed. |

<!-- /doc:region name="fix_log" -->

<!-- doc:region name="appendix_evidence" kind="immutable" -->

## Appendix: Evidence

Original frozen regression output:

```text
Tests 2 failed | 1 passed (3)
expected '%2' to be '%1'
expected [ '%0', '%2', '%1' ] to have a length of 2 but got 3
```

The initial production fix was subsequently disabled by restoring only the original staged launcher bytes.
The same frozen test failed again; the fixed launcher bytes were restored in a finally block.
Existing staged content was not restaged or replaced in the index.

<!-- /doc:region name="appendix_evidence" -->
