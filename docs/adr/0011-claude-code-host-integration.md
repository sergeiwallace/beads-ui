# 0011. Claude Code host integration

## Status

Accepted.

## Context

Claude Code's terminal, desktop and editor hosts expose different
rendering primitives. Its sandbox also restricts imports, globals and
which module may use the engine interface.

## Decision

- `plugins/beads-ui/hooks/register.ts` uses Claude Code's band site
  on terminal and desktop. The Tasks Client draws on those hosts.
  VS Code uses the element tree, which also replaces a faulted
  Client for the rest of the session. The Client receives plain
  data and posts untrusted messages to the same handlers as the
  element tree. Host hover styling needs no redraw or post.
  The engine supplies updated dimensions on resize.
- Preserve keyboard ownership during unasked opens, including while
  settings load. An asked open can focus from the prompt and respect
  the retained view. An unplaced pane can reopen via `/bu`.
  The band menu leaves focus alone. Retire Claude Code's native
  pane by denying TaskCreate by name when configured.
- A Claude Code daemon worker inherits the daemon's
  `CLAUDE_CODE_TASK_LIST_ID`. Use the worker's
  `CLAUDE_CODE_SESSION_NAME` for its identity.
- Run `node scripts/check-core-purity.mjs <core-dir>` for the shared
  core. The mod sandbox refuses dynamic code generation at runtime.
  The gate also rejects globals and computed imports that conceal
  references from the scan, and excludes Node-only test code.
- Run `node scripts/check-marketplace.mjs <repo-root> <plugin-source>`
  because strict validation can pass a marketplace source without
  a plugin folder. The gate checks the listing against the installed
  plugin name.
- Run `node scripts/check-plugin-allowlist.mjs <plugin-dir> <allowlist.json>`
  for both validator notes and source locations. The validator attributes
  a helper's engine call to the hook module that reached it. The source
  gate therefore checks engine members, type references and bare
  engine handoffs outside allowed positions. Validator annotations can
  contain commas and implicit suffixes that must stay with their
  original entry. Only exact warnings with a recorded reason qualify
  for an exception. The engine type list comes from the generated
  Claude Code declarations.

## Consequences

Static inspection misses some structurally reconstructed engine types,
engine nouns passed directly to helpers, and aliases passed to untyped
helpers. Mod tests and review cover those paths. The kit consumes
`$.ui.focus` without echoing it and cannot emit a test-induced
`ui.fault`. Dedicated host probes cover focus and fault behavior.
