import type { ReviewQueueEntry } from "@beads-ui/core";
import type { Skill } from "../composer/skills.ts";
import type { DispatchStatus, DispatchSummary } from "../composer/types.ts";

/** An answer to a held item: an option per decision chosen with a control, or typed text. */
export type AnswerInput = { choices: { decision: string; key: string }[] } | { text: string };

/** A held item's Markdown body, as it is being read. */
export type BodyRead =
  | { state: "loading" }
  | { state: "ok"; text: string }
  | { state: "error"; source: string; message: string };

/** What an unblock did: a dispatch to the owning session, or the server's own unblock. */
export type UnblockResult =
  | { via: "dispatch"; dispatch: DispatchSummary }
  | { via: "server"; message: string };

/** The writes and reads the Review view asks of the app, each against one entry. */
export interface ReviewActions {
  answer(entry: ReviewQueueEntry, input: AnswerInput): Promise<DispatchSummary>;
  unblock(entry: ReviewQueueEntry, resolution: string, followUp: string): Promise<UnblockResult>;
  prompt(entry: ReviewQueueEntry, text: string): Promise<DispatchSummary>;
  status(id: string): Promise<DispatchStatus>;
  /** A held item's Markdown body. */
  body(entry: ReviewQueueEntry): Promise<string>;
  loadSkills?: () => Promise<Skill[]>;
}
