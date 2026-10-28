// The text of bd-count-assignee-by-status.json, byte for byte, as a module: the mod test environment loads
// only code files. fixture-modules.spec.ts fails when the two differ.
// Captured read-only from this repository's own Beads store, bd 1.3.1: `bd count --assignee=ops-vm-3 --by-status --json`.
export default "{\n  \"groups\": [\n    {\n      \"count\": 1,\n      \"group\": \"blocked\"\n    },\n    {\n      \"count\": 3,\n      \"group\": \"closed\"\n    },\n    {\n      \"count\": 4,\n      \"group\": \"in_progress\"\n    }\n  ],\n  \"schema_version\": 1,\n  \"total\": 8\n}\n";
