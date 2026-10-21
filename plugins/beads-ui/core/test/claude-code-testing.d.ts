// Types for the runner-neutral kit name. Claude Code supplies the module at `claude plugin test`
// time and vitest.config.ts aliases it to Vitest, so the type check reads Vitest's signatures.
declare module "claude-code/testing" {
  export { describe, expect, test } from "vitest";
}
