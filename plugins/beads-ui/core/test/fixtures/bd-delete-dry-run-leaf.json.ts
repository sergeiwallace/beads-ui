// The text of bd-delete-dry-run-leaf.json, byte for byte, as a module: the mod test environment loads
// only code files. fixture-modules.spec.ts fails when the two differ.
// Captured read-only from this repository's own Beads store, bd 1.3.1: `bd delete BU-2zw --dry-run --json, exit 0`.
export default "{\n  \"cascade\": false,\n  \"dry_run\": true,\n  \"issue_ids\": [\n    \"BU-2zw\"\n  ],\n  \"preview\": true,\n  \"schema_version\": 1,\n  \"would_delete\": 1,\n  \"would_orphan\": 0,\n  \"would_remove_dependencies\": 0,\n  \"would_remove_events\": 3,\n  \"would_remove_labels\": 1\n}\n";
