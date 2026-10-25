import { type ImageVerdict, type TerminalFacts, terminalImages } from "../core/src/index.ts";
import type { Host } from "./host.ts";

// What the terminal can draw (D-43, T-2C.13), read once at session start: whether an Image's
// pixels reach the screen. Inside tmux that needs allow-passthrough on, which tmux is asked for
// read-only, and a terminal outside it that draws pictures.

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
    // The terminal outside tmux is asked for only when passthrough would let a picture through.
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
