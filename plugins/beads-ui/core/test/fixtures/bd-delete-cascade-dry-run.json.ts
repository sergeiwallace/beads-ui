// The text of bd-delete-cascade-dry-run.json, byte for byte, as a module: the mod test environment loads
// only code files. fixture-modules.spec.ts fails when the two differ.
// Captured read-only from this repository's own Beads store, bd 1.3.1: `bd delete BU-mg2.3 --cascade --dry-run --json, exit 0`.
export default "{\n  \"cascade\": true,\n  \"dry_run\": true,\n  \"issue_ids\": [\n    \"BU-mg2.3\"\n  ],\n  \"preview\": true,\n  \"schema_version\": 1,\n  \"would_delete\": 11,\n  \"would_orphan\": 0,\n  \"would_remove_dependencies\": 11,\n  \"would_remove_events\": 34,\n  \"would_remove_labels\": 11\n}\n";
