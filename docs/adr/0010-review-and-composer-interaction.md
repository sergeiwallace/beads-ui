# 0010. Review and composer interaction

## Status

Accepted.

## Context

The Review view accepts held decisions and prompts. It handles external
option data, a lazily loaded editor and typing on mobile keyboards.

## Decision

- `packages/web-ui/src/composer/PromptComposer.tsx` loads Lexical on
  first focus because it is the largest editor dependency. Keep the
  full editor out of the eager barrel exports. Check the exact outgoing
  Markdown before calling the write. Keep the draft on failure and
  remount the editor after sending because it owns its document.
  Leave the empty-send target visible. Each prompt defaults to arming
  a goal, with a per-send override. The virtual viewport keeps the
  action visible over the keyboard.
- Derive the catalog from current props or the fetch result.
  A `useState` initial value would miss later prop changes. Missing or
  unavailable catalogs leave tokens unknown. A successfully loaded
  empty catalog can mark tokens invalid. The verdict is three-valued
  and available nonvisually as well as through its styling.
- Lexical creates the node at the first letter, so recompute validity
  as text changes and when the catalog arrives. A paste or whole-string
  insertion hid this failure during typing. The built-in typeahead
  requires a plain text node, which the skill token replaces at the
  first letter. The custom typeahead reads the caret's text node in
  either form.
- `packages/web-ui/src/composer/secrets.ts` resets a shared global
  regular expression's `lastIndex` before reuse. Match the value
  inside an assignment, keep the earliest overlapping result and use
  rule order for ties. Specific rules precede generic patterns so one
  token has one finding.
- Keep session liveness, dispatch progress and receiver output separate
  even inside a segmented mobile display. Review rereads by stable
  item key because the item object changes on every data refresh.
  The held-options protocol supplies versioned per-item JSON. Malformed
  or unavailable options fall back to sanitized Markdown and a typed
  answer. Never render a partial option card. Single answers have a
  five-second undo window and bulk approval requires confirmation.
  Ownerless unblock runs on the server. A follow-up for an owned task
  waits for the unblock's acted state.
- `plugins/beads-ui/core/src/keymap.ts` applies WCAG 2.1.4 to unmodified
  printable keys. Named keys remain available when single-key shortcuts
  are off. Printable key values already encode Shift, while named keys
  keep it as a modifier. Text fields keep their unmodified keys.

## Consequences

Typing, paste and delayed catalog arrival exercise different paths.
The editor and Review tests pin all three catalog states and retain
keyboard access across the responsive layouts.
