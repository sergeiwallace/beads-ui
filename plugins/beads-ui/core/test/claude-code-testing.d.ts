// For the repository type check (`npx tsc --noEmit`): the core's dual-runner suites import
// claude-code/testing, which Vitest maps to vitest, so type them against vitest's API.
// Use only what both kits share: describe, test, expect and their common matchers.
declare module "claude-code/testing" {
  export { describe, expect, test } from "vitest";
}
