import { type ImageVerdict, type TerminalFacts, terminalImages } from "../core/src/index.js";
import type { Host } from "./host.js";

const TMUX_TIMEOUT_MS = 2_000;

const answer = (host: Host, argv: readonly string[]) =>
  host
    .run(argv, TMUX_TIMEOUT_MS)
    .then((ran) => (ran.exitCode === 0 ? ran.stdout.trim() : undefined))
    .catch(() => undefined);

/** The terminal's facts and the verdict on them; a fact that cannot be read draws no Image. */
export async function readTerminal(host: Host): Promise<ImageVerdict> {
  const env = await host.terminalEnv().catch(() => undefined);
  const facts: TerminalFacts = {
    ...(env?.term === undefined ? {} : { term: env.term }),
    ...(env?.termProgram === undefined ? {} : { termProgram: env.termProgram }),
    ...(env?.termProgramVersion === undefined
      ? {}
      : { termProgramVersion: env.termProgramVersion }),
  };
  if (env?.tmux !== undefined && env.tmux !== "") {
    const passthrough = await answer(host, ["tmux", "show-options", "-gv", "allow-passthrough"]);
    const clientTermtype =
      passthrough === "on" || passthrough === "all"
        ? await answer(host, ["tmux", "display-message", "-p", "#{client_termtype}"])
        : undefined;
    facts.tmux = {
      ...(passthrough === undefined ? {} : { passthrough }),
      ...(clientTermtype === undefined ? {} : { clientTermtype }),
    };
  }
  return terminalImages(facts);
}
