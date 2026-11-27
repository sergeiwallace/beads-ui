export declare const TEST_JOBS_VAR: "BEADS_UI_TEST_JOBS";
export declare const DEFAULT_TEST_JOBS: number;
export declare const MAX_TEST_JOBS: number;
export declare function testJobs(env?: Record<string, string | undefined>): number;
export declare const TEST_SCOPE_VAR: "BEADS_UI_TEST_SCOPE";
export declare const COMMIT_SCOPE: "commit";
export declare function testScope(env?: Record<string, string | undefined>): "" | "commit";
