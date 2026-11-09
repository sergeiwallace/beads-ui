import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
let cwd: string;
const bd = (await exec("sh", ["-c", "command -v bd"], { encoding: "utf8" })).stdout.trim();

async function install(
  args: string[] = [],
  options: { systemctlFails?: boolean; path?: string } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  await writeFile(
    join(fakeBin, "systemctl"),
    `#!/bin/sh\necho "$*" >> '${calls}'\n${options.systemctlFails ? "echo 'Failed to connect to bus' >&2; exit 1\n" : ""}`,
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

const unitFile = () => join(configHome, "systemd", "user", "beads-ui-web.service");

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "beads-ui-web-service-"));
  configHome = join(root, "config");
  fakeBin = join(root, "bin");
  calls = join(root, "systemctl-calls");
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
    expect(await readFile(calls, "utf8")).toBe("--user daemon-reload\n");
  });

  it("should rewrite the one unit and reload again when run a second time, never adding another", async () => {
    expect((await install()).code).toBe(0);
    const again = await install(["--port", "5001"]);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain(`rewrote ${unitFile()}:`);
    expect(await readdir(dirname(unitFile()))).toEqual(["beads-ui-web.service"]);
    expect(await readFile(unitFile(), "utf8")).toContain("--port 5001\n");
    expect(await readFile(calls, "utf8")).toBe("--user daemon-reload\n--user daemon-reload\n");
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
