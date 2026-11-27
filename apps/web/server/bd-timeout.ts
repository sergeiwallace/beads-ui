import {
  type BdClient,
  type BdClientOptions,
  createBdClient,
  DEFAULT_TIMEOUT_MS,
} from "@sergeiwallace/beads-ui-bd-node";

const MS_PER_SECOND = 1000;

export const DEFAULT_BD_CALL_TIMEOUT_SECONDS = DEFAULT_TIMEOUT_MS / MS_PER_SECOND;

export function timedBd(
  options: Omit<BdClientOptions, "timeoutMs">,
  timeoutMs: () => Promise<number>,
): BdClient {
  const base = createBdClient(options);
  return new Proxy(base, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        const client = createBdClient({ ...options, timeoutMs: await timeoutMs() });
        const call = Reflect.get(client, property) as (...callArgs: unknown[]) => unknown;
        return call.apply(client, args);
      };
    },
  });
}
