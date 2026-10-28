# Web app stack signals, measured 2026-10-28

Raw readings behind the stack recheck in
[beads-ui-web-app-ux-stack-and-shared-code.md](../beads-ui-web-app-ux-stack-and-shared-code.md).
Measured on sem-kg-ec2 between 2026-10-28T00:00Z and 00:40Z by the research leg for BU-mg2.5.1.1.

## npm registry: latest dist-tag

Command, run once per package: `npm view <package> version time.modified --json` (npm 11.19.0).
`time.modified` is when the package document last changed, which is not the latest version's
publish date. The publish dates are in the next table.

| Package | Latest | Document modified |
|---|---|---|
| react | 19.3.1 | 2026-10-27T16:27:02Z |
| react-dom | 19.3.1 | 2026-10-27T16:25:14Z |
| vite | 8.3.5 | 2026-10-21T06:38:55Z |
| @vitejs/plugin-react | 6.1.2 | 2026-10-05T10:08:27Z |
| @tanstack/react-query | 5.105.0 | 2026-10-26T09:31:29Z |
| @tanstack/react-table | 9.3.1 | 2026-10-12T16:50:45Z |
| @tanstack/react-virtual | 3.14.23 | 2026-10-26T12:52:24Z |
| @tanstack/react-router | 1.170.46 | 2026-10-22T20:10:14Z |
| @tanstack/hotkeys | 0.18.0 | 2026-10-24T18:33:51Z |
| @tanstack/react-hotkeys | 0.17.0 | 2026-10-24T18:33:34Z |
| zustand | 5.0.16 | 2026-10-22T04:32:02Z |
| @base-ui/react | 1.9.0 | 2026-10-09T08:52:44Z |
| @base-ui-components/react (old name) | 1.0.0-rc.0 | 2026-07-15T15:29:00Z |
| @radix-ui/react-dialog | 1.3.1 | 2026-10-14T13:27:30Z |
| @atlaskit/pragmatic-drag-and-drop | 4.0.0 | 2026-09-24T01:55:52Z |
| @dnd-kit/react | 0.5.1 | 2026-10-15T12:09:58Z |
| @dnd-kit/core (legacy) | 6.3.1 | 2024-12-05T17:10:20Z |
| recharts | 3.10.1 | 2026-10-24T13:27:13Z |
| cmdk | 1.1.1 | 2025-08-27T19:56:17Z |
| frappe-gantt | 1.2.2 | 2026-02-25T10:12:26Z |
| tailwindcss | 4.3.3 | 2026-10-19T16:02:21Z |
| motion | 14.7.1 | 2026-10-27T11:42:37Z |
| shadcn (CLI) | 4.23.0 | 2026-10-27T12:33:52Z |
| react-markdown | 10.1.0 | 2025-03-07T10:32:53Z |
| remark-gfm | 4.0.1 | 2025-02-10T12:43:11Z |
| unified | 11.0.5 | 2024-06-19T12:33:43Z |
| @modelcontextprotocol/ext-apps | 2.0.4 | 2026-10-27T09:02:16Z |
| @xyflow/react | 12.12.0 | 2026-10-11T19:23:57Z |
| sonner | 2.0.8 | 2026-08-09T08:46:10Z |
| vaul | 1.1.2 | 2024-12-14T00:56:01Z |
| @floating-ui/react | 0.27.20 | 2026-07-11T08:41:33Z |
| fractional-indexing | 4.0.0 | 2026-06-25T06:10:00Z |
| react-hotkeys-hook | 5.3.3 | 2026-06-26T14:23:15Z |
| tinykeys | 4.0.1 | 2026-09-25T21:05:04Z |

## npm registry: publish dates

Command: `npm view <package> time --json`, the last stable entries kept (pre-release tags
filtered out with `grep -v`).

| Package | Version and publish time |
|---|---|
| react | 19.0.0 2024-12-05; 19.2.0 2025-10-01; 19.3.0 2026-09-09; 19.3.1 2026-10-14T16:47:15Z |
| vite | 8.3.5 2026-10-21T06:38:54Z |
| @tanstack/react-query | 5.105.0 2026-10-26T09:31:29Z |
| @tanstack/react-table | 9.3.1 2026-10-12T16:50:44Z |
| @tanstack/react-virtual | 3.14.23 2026-10-26T12:52:22Z |
| zustand | 5.0.16 2026-10-22T04:32:02Z |
| @base-ui/react | 1.0.0 2025-12-11T15:56:18Z (package created that day); 1.9.0 2026-10-09T08:52:43Z |
| @atlaskit/pragmatic-drag-and-drop | 3.1.0 2026-08-29; 4.0.0 2026-09-24T01:55:52Z |
| @dnd-kit/react | 0.5.1 2026-10-15T12:09:58Z |
| recharts | 3.0.0 2025-06-23; 3.10.1 2026-07-25T15:23:05Z |
| cmdk | 1.1.0 and 1.1.1 2025-03-14 (no later version) |
| frappe-gantt | 1.2.1 2026-02-17; 1.2.2 2026-02-25T10:12:26Z |
| tailwindcss | 4.0.0 2025-01-21; 4.3.3 2026-07-16T12:03:35Z |
| motion | 14.7.1 2026-10-27T11:42:37Z |
| shadcn (CLI) | 4.23.0 2026-10-27T12:33:51Z |
| @modelcontextprotocol/ext-apps | 2.0.4 2026-10-27T07:16:07Z (dist-tag latest); 2.1.0 2026-10-27T08:31:59Z (published, not tagged latest; dist-tags `{"release-2.0": "2.0.3", "latest": "2.0.4"}`) |
| @tanstack/hotkeys | 0.18.0 2026-10-24T18:33:51Z |
| @xyflow/react | 12.12.0 2026-09-24T12:41:36Z |
| react-markdown | 10.1.0 2025-03-07T10:32:53Z |
| babel-plugin-react-compiler | 1.0.0 2025-10-07T19:19:01Z |
| @tanstack/db | 0.15.2 2026-10-21 (pre-1.0) |
| @tanstack/react-db | 0.5.12 2026-10-21 (pre-1.0) |
| rolldown | 1.2.15 2026-10-21 |

## npm registry: React peer ranges

Command: `npm view <package> peerDependencies --json`.

| Package | Peer range |
|---|---|
| cmdk 1.1.1 | `react` and `react-dom` `^18 \|\| ^19 \|\| ^19.0.0-rc` |
| recharts 3.10.1 | `react` `^16.8.0 \|\| ^17.0.0 \|\| ^18.0.0 \|\| ^19.0.0`, plus `react-is` and `react-dom` the same |
| @base-ui/react 1.9.0 | `react`, `react-dom` and `@types/react` `^17 \|\| ^18 \|\| ^19`, plus `date-fns ^4.0.0` and `@date-fns/tz ^1.2.0` |
| @atlaskit/pragmatic-drag-and-drop 4.0.0 | no peer dependencies; runtime dependencies `raf-schd`, `@babel/runtime`, `bind-event-listener` (framework-free) |

Pragmatic drag and drop companion packages on the same date: `@atlaskit/pragmatic-drag-and-drop-react-accessibility` 3.2.4, `@atlaskit/pragmatic-drag-and-drop-hitbox` 3.0.0.

## GitHub REST API: repository signals

Command, one per repository: `gh api repos/<owner>/<repo> --jq '[.full_name, .stargazers_count, .pushed_at, .open_issues_count, .archived] | @tsv'`.
`open_issues_count` includes open pull requests.

| Repository (as returned) | Stars | Last push | Open issues and PRs | Archived |
|---|---|---|---|---|
| dip/cmdk (requested as pacocoursey/cmdk) | 13,048 | 2025-10-29T04:13:58Z | 77 | false |
| atlassian/pragmatic-drag-and-drop | 12,787 | 2026-10-23T02:50:43Z | 104 | false |
| mui/base-ui | 11,248 | 2026-10-27T20:15:19Z | 445 | false |
| shadcn-ui/ui | 126,716 | 2026-10-27T12:59:03Z | 1,771 | false |
| TanStack/hotkeys (created 2026-01-21) | 755 | 2026-10-24T18:33:05Z | 1 | false |
| modelcontextprotocol/ext-apps | 3,013 | 2026-10-27T09:03:11Z | 239 | false |
| frappe/gantt | 6,155 | 2026-06-18T11:52:32Z | 81 | false |
| motiondivision/motion | 34,594 | 2026-10-27T17:43:38Z | 10 | false |
| xyflow/xyflow | 38,798 | 2026-10-27T11:06:32Z | 164 | false |
| clauderic/dnd-kit | 17,752 | 2026-10-27T02:11:51Z | 139 | false |
| hcengineering/platform (Huly) | 28,000 | 2026-10-26T14:49:14Z | not read | false |
| makeplane/plane (AGPL-3.0) | 61,559 | 2026-10-27T13:22:41Z | not read | false |

Huly's repository is not archived on GitHub, but its README reads "This repository is frozen and is
no longer actively maintained" (fetched 2026-10-28).

## Fleet repositories read, read-only

| Repository and path | Local HEAD | What was read |
|---|---|---|
| app-portal `package.json` | b73683e (2026-10-19) | `react ^19.2.0`, `react-dom ^19.2.0`, `tailwindcss ^4.2.2`, `vite ^7.3.2`, `@radix-ui/react-dialog ^1.3.1`, `@radix-ui/react-label`, `@radix-ui/react-slot`, `@radix-ui/react-toast`; no Base UI |
| ai-core `web/src/components/Composer.tsx`, `web/src/views/Review.tsx` | f40fa2bd (2026-10-21) | the queue dashboard's Lexical prompt composer (a `/skill` typeahead, Enter inserts a newline, an explicit "Queue prompt" button, a secret-guard refusal line) and its Review view (accept outcomes classified as no-suggestion, dependency-open and refused; resolution from the `queue.review.resolved` event) |
