// The text of bd-delete-dry-run-leaf.txt, byte for byte, as a module: the mod test environment loads
// only code files. fixture-modules.spec.ts fails when the two differ.
// Captured read-only from this repository's own Beads store, bd 1.3.1: `bd delete BU-2zw --dry-run, exit 0`.
export default "\n⚠️  DELETE PREVIEW\n\nIssue to delete:\n  BU-2zw: npm audit: 10 dev-only advisories under markdownlint-cli2\n\nWould delete: 1 issues\nWould remove: 0 dependencies, 1 labels, 3 events\n\n(Dry-run mode - no changes made)\n";
