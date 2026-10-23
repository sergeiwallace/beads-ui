// The text of bd-count-by-status.json, byte for byte, as a module: the mod test environment loads
// only code files. fixture-modules.spec.ts fails when the two differ.
// Captured read-only from this repository's own Beads store, bd 1.3.1: `bd count --by-status --json`.
export default "{\n  \"groups\": [\n    {\n      \"count\": 1,\n      \"group\": \"blocked\"\n    },\n    {\n      \"count\": 27,\n      \"group\": \"closed\"\n    },\n    {\n      \"count\": 6,\n      \"group\": \"in_progress\"\n    },\n    {\n      \"count\": 14,\n      \"group\": \"open\"\n    }\n  ],\n  \"schema_version\": 1,\n  \"total\": 48\n}\n";
