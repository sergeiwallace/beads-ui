import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { envFromProcess } from "./config.ts";
import { createServer } from "./server.ts";

/** Serves over stdio until the host closes the pipe; nothing but protocol goes to stdout. */
export async function main(): Promise<void> {
  const server = createServer(envFromProcess());
  await server.connect(new StdioServerTransport());
}
