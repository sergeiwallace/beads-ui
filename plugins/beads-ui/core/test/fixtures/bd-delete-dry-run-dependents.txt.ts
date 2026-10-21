// The text of bd-delete-dry-run-dependents.txt, byte for byte, as a module: the mod test environment loads
// only code files. fixture-modules.spec.ts fails when the two differ.
// Captured read-only from this repository's own Beads store, bd 1.3.1: `bd delete BU-mg2.3 --dry-run, exit 1, stdout`.
export default "\n⚠️  DELETE PREVIEW\n\nIssues to delete (1):\n  BU-mg2.3: beads-ui Claude Code mod: the task manager inside the Claude Code TUI, with mouse control\n\nissue BU-mg2.3 has dependents not in deletion set; use --cascade to delete them or --force to orphan them\n";
