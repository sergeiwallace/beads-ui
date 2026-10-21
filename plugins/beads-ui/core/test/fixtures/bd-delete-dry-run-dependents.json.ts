// The text of bd-delete-dry-run-dependents.json, byte for byte, as a module: the mod test environment loads
// only code files. fixture-modules.spec.ts fails when the two differ.
// Captured read-only from this repository's own Beads store, bd 1.3.1: `bd delete BU-mg2.3 --dry-run --json, exit 1, stdout`.
export default "{\n  \"cascade\": false,\n  \"dry_run\": true,\n  \"error\": \"issue BU-mg2.3 has dependents not in deletion set; use --cascade to delete them or --force to orphan them\",\n  \"issue_ids\": [\n    \"BU-mg2.3\"\n  ],\n  \"preview\": true,\n  \"schema_version\": 1\n}\n";
