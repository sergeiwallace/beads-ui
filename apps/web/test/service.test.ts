import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BIN, hostConfig } from "./auth-env.ts";

const exec = promisify(execFile);

// The supervised run (web app design T-W3.2's deploy step): `beads-ui-web install-service`
// writes the systemd user unit from the host's settings and reloads systemd.

let root: string;
let configHome: string;
let fakeBin: string;
let calls: string;
let shown: string;
let cwd: string;
const bd = (await exec("sh", ["-c", "command -v bd"], { encoding: "utf8" })).stdout.trim();

async function install(
  args: string[] = [],
  options: { systemctlFails?: boolean; path?: string } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  await writeFile(
    join(fakeBin, "systemctl"),
    `#!/bin/sh\necho "$*" >> '${calls}'\n${options.systemctlFails ? "echo 'Failed to connect to bus' >&2; exit 1\n" : ""}[ "$2" = show ] && cat '${shown}'\nexit 0\n`,
  );
  await chmod(join(fakeBin, "systemctl"), 0o755);
  try {
    const { stdout, stderr } = await exec(process.execPath, [BIN, "install-service", ...args], {
      cwd,
      env: {
        HOME: join(root, "home"),
        XDG_CONFIG_HOME: configHome,
        XDG_STATE_HOME: join(root, "state"),
        PATH: options.path ?? `${fakeBin}:${dirname(bd)}:/usr/bin:/bin`,
      },
      encoding: "utf8",
      timeout: 60_000,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? -1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
  }
}

const SHOW = "--user show -p Transient -p ActiveState beads-ui-web.service\n";

const unitFile = () => join(configHome, "systemd", "user", "beads-ui-web.service");

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "beads-ui-web-service-"));
  configHome = join(root, "config");
  fakeBin = join(root, "bin");
  calls = join(root, "systemctl-calls");
  shown = join(root, "systemctl-show");
  cwd = join(root, "repo");
  await mkdir(join(configHome, "beads-ui"), { recursive: true });
  await mkdir(fakeBin);
  await mkdir(cwd);
  await mkdir(join(root, "home"));
  await writeFile(
    join(configHome, "beads-ui", "beads-ui.toml"),
    hostConfig({ allowRepos: ["repo"], extra: "[web]\nport = 4999\n" }),
  );
  await writeFile(calls, "");
  await writeFile(shown, "Transient=no\nActiveState=inactive\n");
});

afterEach(async () => {
  await rm(root, { recursive: true });
});

describe("beads-ui-web install-service", () => {
  it("should write a unit filled from the host's settings, reload systemd and print the start command", async () => {
    const result = await install();
    expect(result.code).toBe(0);
    const unit = await readFile(unitFile(), "utf8");
    expect(unit).not.toMatch(/@[A-Z_]+@/);
    expect(unit).toContain(`WorkingDirectory=${cwd}\n`);
    expect(unit).toContain(`ExecStart=${process.execPath} ${BIN} --port 4999\n`);
    expect(unit).toContain(`Environment=XDG_CONFIG_HOME=${configHome}\n`);
    expect(unit).toMatch(new RegExp(`^Environment=PATH=${dirname(bd)}:`, "m"));
    expect(unit).toContain("Restart=on-failure\n");
    expect(unit).toContain("WantedBy=default.target\n");
    expect(result.stdout).toContain(`wrote ${unitFile()}:`);
    expect(result.stdout).toContain(unit);
    expect(result.stdout).toContain(
      "start it with: systemctl --user enable --now beads-ui-web.service",
    );
    expect(await readFile(calls, "utf8")).toBe(`--user daemon-reload\n${SHOW}`);
  });

  it("should rewrite the one unit and reload again when run a second time, never adding another", async () => {
    expect((await install()).code).toBe(0);
    const again = await install(["--port", "5001"]);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain(`rewrote ${unitFile()}:`);
    expect(await readdir(dirname(unitFile()))).toEqual(["beads-ui-web.service"]);
    expect(await readFile(unitFile(), "utf8")).toContain("--port 5001\n");
    expect(await readFile(calls, "utf8")).toBe(
      `--user daemon-reload\n${SHOW}--user daemon-reload\n${SHOW}`,
    );
    const same = await install(["--port", "5001"]);
    expect(same.stdout).toContain(`kept ${unitFile()}:`);
  });

  it("should say the unit is written but not loaded, and exit 1, when systemctl cannot reload", async () => {
    const result = await install([], { systemctlFails: true });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "systemctl --user daemon-reload failed: Failed to connect to bus",
    );
    expect(result.stdout).not.toContain("start it with");
  });

  it("should refuse and write nothing when bd is not on PATH", async () => {
    const result = await install([], { path: `${fakeBin}:/usr/bin:/bin` });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("bd is not on PATH");
    await expect(readFile(unitFile(), "utf8")).rejects.toThrow();
  });

  it("should refuse a port outside 1 to 65535 and write nothing", async () => {
    const result = await install(["--port", "70000"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--port takes a whole number from 1 to 65535");
    await expect(readFile(unitFile(), "utf8")).rejects.toThrow();
  });
});

// `install-service --enable`: the one command that takes a host from an ad hoc run to an enabled,
// supervised service that answers. The fake systemctl starts nothing; a listener on a free port
// plays the started server's /healthz.
describe("beads-ui-web install-service --enable", () => {
  let listener: Server;
  let port: number;
  let health: { status: number; hits: number };

  const probeConfig = (timeout: number, interval: number) =>
    writeFile(
      join(configHome, "beads-ui", "beads-ui.toml"),
      hostConfig({
        allowRepos: ["repo"],
        extra: `[web]\nport = 4999\nservice_probe_timeout_seconds = ${timeout}\nservice_probe_interval_seconds = ${interval}\n`,
      }),
    );

  beforeEach(async () => {
    health = { status: 200, hits: 0 };
    listener = createServer((request, response) => {
      if (request.url === "/healthz") health.hits += 1;
      const status = request.url === "/healthz" ? health.status : 404;
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: status === 200 ? "ok" : "unavailable" }));
    });
    await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
    port = (listener.address() as AddressInfo).port;
    await probeConfig(5, 0.1);
  });

  afterEach(async () => {
    if (listener.listening) await new Promise((resolve) => listener.close(resolve));
  });

  it("should write the unit, reload, enable --now, and exit 0 once /healthz answers 200", async () => {
    const result = await install(["--enable", "--port", String(port)]);
    expect(result.code).toBe(0);
    expect(await readFile(calls, "utf8")).toBe(
      `${SHOW}--user daemon-reload\n--user enable --now beads-ui-web.service\n`,
    );
    expect(await readFile(unitFile(), "utf8")).toContain(`--port ${port}\n`);
    expect(health.hits).toBeGreaterThan(0);
    expect(result.stdout).toContain(`enabled and started beads-ui-web.service from ${unitFile()}`);
    expect(result.stdout).toContain(
      `http://127.0.0.1:${port}/healthz answered 200 {"status":"ok"}`,
    );
    expect(result.stdout).not.toContain("start it with");
  });

  it("should exit 1 with the last probe error and the journal command, leaving the unit enabled, when /healthz never answers 200", async () => {
    health.status = 503;
    await probeConfig(1, 0.1);
    const result = await install(["--enable", "--port", String(port)]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      `http://127.0.0.1:${port}/healthz did not answer 200 within 1 s; last probe: HTTP 503 {"status":"unavailable"}`,
    );
    expect(result.stderr).toContain("read its log with: journalctl --user -u beads-ui-web.service");
    const log = await readFile(calls, "utf8");
    expect(log).toContain("--user enable --now beads-ui-web.service\n");
    expect(log).not.toMatch(/disable|stop/);
  });

  it("should name a refused connection as the last probe error when nothing listens", async () => {
    await new Promise((resolve) => listener.close(resolve));
    await probeConfig(1, 0.2);
    const result = await install(["--enable", "--port", String(port)]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("last probe: ECONNREFUSED");
  });

  it("should refuse before writing or enabling anything, naming the stop and re-run commands, when a transient unit of that name is live", async () => {
    await writeFile(shown, "Transient=yes\nActiveState=active\n");
    const result = await install(["--enable", "--port", String(port)]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("a transient unit named beads-ui-web.service is live");
    expect(result.stderr).toContain("stop it with: systemctl --user stop beads-ui-web.service\n");
    expect(result.stderr).toContain(
      `then run again: cd ${cwd} && ${process.execPath} ${BIN} install-service --enable --port ${port}\n`,
    );
    expect(await readFile(calls, "utf8")).toBe(SHOW);
    await expect(readFile(unitFile(), "utf8")).rejects.toThrow();
    expect(health.hits).toBe(0);
  });

  it("should still write the unit without --enable, and warn with the stop command, when a transient unit is live", async () => {
    await writeFile(shown, "Transient=yes\nActiveState=active\n");
    const result = await install();
    expect(result.code).toBe(0);
    expect(await readFile(unitFile(), "utf8")).toContain("--port 4999\n");
    expect(result.stdout).toContain(
      "start it with: systemctl --user enable --now beads-ui-web.service",
    );
    expect(result.stderr).toContain("warning: a transient unit named beads-ui-web.service is live");
    expect(result.stderr).toContain("stop it with: systemctl --user stop beads-ui-web.service\n");
    expect(await readFile(calls, "utf8")).toBe(`--user daemon-reload\n${SHOW}`);
  });

  it("should read the probe timeout and interval from beads-ui.toml at the call", async () => {
    health.status = 503;
    await probeConfig(1, 0.1);
    const started = Date.now();
    const result = await install(["--enable", "--port", String(port)]);
    expect(result.code).toBe(1);
    expect(Date.now() - started).toBeLessThan(20_000);
    expect(result.stderr).toContain("within 1 s");
    expect(health.hits).toBeGreaterThanOrEqual(5);
  });

  it("should name a probe setting that is not a positive number and use the default", async () => {
    await writeFile(
      join(configHome, "beads-ui", "beads-ui.toml"),
      hostConfig({ allowRepos: ["repo"], extra: "[web]\nservice_probe_interval_seconds = -1\n" }),
    );
    const result = await install(["--enable", "--port", String(port)]);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain(
      "web.service_probe_interval_seconds must be a positive number of seconds, not -1; using 1",
    );
  });

  it("should rewrite the unit, restart the running service and probe again on a re-run", async () => {
    expect((await install(["--enable", "--port", String(port)])).code).toBe(0);
    await writeFile(calls, "");
    await writeFile(shown, "Transient=no\nActiveState=active\n");
    const hitsBefore = health.hits;
    const again = await install(["--enable", "--port", String(port)]);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain(`kept ${unitFile()}:`);
    expect(await readFile(calls, "utf8")).toBe(
      `${SHOW}--user daemon-reload\n--user enable --now beads-ui-web.service\n--user restart beads-ui-web.service\n`,
    );
    expect(health.hits).toBeGreaterThan(hitsBefore);
    expect(again.stdout).toContain(`restarted beads-ui-web.service from ${unitFile()}`);
    expect(await readdir(dirname(unitFile()))).toEqual(["beads-ui-web.service"]);
  });
});
