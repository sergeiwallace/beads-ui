---
title: "Measurements behind the private-goal privacy and access-control findings"
category: research
tags: [research-evidence, beads-ui, goals, privacy]
status: complete
source: "claude-opus-5-5-2026-10-28"
task: BU-ylx.11.1.3
display_id: BU-agent-research-nzqd
template_version: "research-findings-1.0.0"
---

# Measurements behind the private-goal privacy and access-control findings

Every measurement below was taken on 2026-10-28 UTC on the employer-provisioned host, read-only. Counts and paths only. No goal content, no matched text and no private names are reproduced.

The ai-harness reads used a worktree at `23ece1e92b6`. `git diff --stat HEAD origin/main` over every cited file returned no output, so each cited file is byte-identical at ai-harness `origin/main` `c6b37c0b72b`.

## M-1. The sergei repository is absent from this host

`ls /data/projects` listed 30 entries. None is named `sergei`. The entries include ai-harness, ai-core, aido, ai-cli-utils, project-template, app-portal and beads-ui.

## M-2. Goal-named tracked paths in ai-harness are mostly the session-goal feature

`git ls-tree -r --name-only origin/main` at `c6b37c0b72b` listed 8,576 tracked paths. A case-insensitive `goal` filter matched 585 of them. The top directories by count:

| Directory | Paths matching `goal` |
|---|---|
| `docs/held` | 112 |
| `tests/draft_goal` | 71 |
| `tests/prompt_injection` | 53 |
| `tests/fixtures` | 50 |
| `docs/prompts` | 47 |
| `config/validation` | 32 |
| `skills/draft-goal` | 25 |
| `docs/bugs` | 25 |
| `skills/start-goal` | 24 |
| `docs/research` | 17 |

The same listing holds 596 paths under `docs/held/` and 94 under `docs/asks/`.

## M-3. The fleet task-id rule matches only the legacy numeric form

The `aih-fleet-task-id` regex from ai-harness `.gitleaks.toml` line 112 was run in Python against synthetic strings:

| Input | Matches |
|---|---|
| `SW-123` | True |
| `SW-12.3` | True |
| `SW-a1b2c3` | False |
| `SW-abcde` | False |
| `SW-some-slug-title-a1b2c3` | False |
| `SW-qq00zz` | False |
| `AIH-qq00zz` | False |

`config/bd_fleet_prefixes.yaml` line 60 assigns prefix `SW` to the `sergei` repository.

## M-4. Beads 1.3.2 help text, read-only

`bd --version` printed `bd version 1.3.2 (9b65b9e19)`.

- `bd repo --help`: "Multi-repo support allows hydrating issues from multiple beads repositories into a single database for unified cross-repo issue tracking." Configuration lives under `repos` in `.beads/config.yaml`.
- ai-harness `.beads/config.yaml` lines 46-56 carry the `repos` block commented out, labelled "Multi-repo configuration (experimental - bd-307)" with `additional` described as "Additional repos to hydrate from (read-only)".
- `bd dep add --help`: "External references are stored as-is and resolved at query time using the external_projects config. They block the issue until the capability is "shipped" in the target project."
- `bd ship --help`: a capability is resolved "when the external project has a closed issue with the provides:<capability> label."
- `bd migrate-personal --help`: it "Finds all issues in the project database created by your git identity" and moves them to the repo configured in `routing.contributor`.
- `bd help` lists no write-time policy or validation hook. `bd lint` checks only template sections by issue type.

## M-5. The ai-harness Beads store publishes to the ai-harness GitHub remote

`bd -C /data/projects/ai-harness dolt remote list` printed one remote, `origin`, a `git+ssh` URL whose path is the ai-harness repository. `.beads/.gitignore` lines 79-87 record that both JSONL sidecars are retired and that `bd_dolt_publish.py` carries the issues and interactions tables "to refs/dolt/data on the GitHub remote".

## M-6. git-inbox writes with plumbing, then pushes

`src/ai_harness/git_inbox.py` line 769 says the sender uses "Plumbing only (`hash-object`, `mktree`, `commit-tree`, `push`)". Line 892 runs `git push --quiet <remote> <commit>:<ref>`. A plumbing commit runs no `pre-commit` hook. `grep` for `--no-verify` and `no_verify` across `scripts/worktree_backup.py` and `src/ai_harness/git_inbox*.py` returned no match, so neither path passes that flag on its push.

## M-7. Machine governance values

`projects-wide-session-config/ai-harness.toml` carries a `governance` key in every machine table. Values: `open` at lines 1711, 1738 and 1836 (the host-b table spans 1826-1852); the employer-gated value at lines 1771, 1809, 1866, 1894 and 1926 (the employer host's table spans 1912-1949). Line 1689 declares the allowed set.

## Scratch

No scratch directory was created. The two tool-result files the fetch and listing tools wrote are harness-managed output, not scratch of this run.
