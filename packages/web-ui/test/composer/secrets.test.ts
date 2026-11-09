import { describe, expect, it } from "vitest";
import { describeRefusal, findSecrets } from "../../src/composer/secrets.ts";
import { FAKE_AWS_KEY } from "./harness.ts";

// The composer's secret guard, the ai-core dashboard's as shipped (T-W1.3): common credential
// shapes are refused, the refusal names the rule and the position and never the value, and
// ordinary prompt text passes. Every token here is assembled at run time.

const repeat = (prefix: string, char: string, count: number) => `${prefix}${char.repeat(count)}`;

describe("findSecrets", () => {
  it.each([
    ["AWS access key id", FAKE_AWS_KEY],
    ["GitHub token", repeat("ghp_", "a", 36)],
    ["GitHub fine-grained token", repeat("github_pat_", "b", 30)],
    ["OpenAI API key", repeat("sk-proj-", "c", 40)],
    ["Anthropic API key", repeat("sk-ant-", "d", 40)],
    ["Slack token", ["xoxb", "123456789012", "abcdefghijkl"].join("-")],
    ["Google API key", repeat("AIza", "e", 35)],
    ["npm token", repeat("npm_", "f", 36)],
    ["PyPI token", repeat("pypi-", "g", 40)],
  ])("should detect a %s", (kind, token) => {
    const findings = findSecrets(`please use ${token} for the run`);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe(kind);
  });

  it("should detect a private key block", () => {
    const header = ["-----BEGIN", "OPENSSH", "PRIVATE", "KEY-----"].join(" ");
    expect(findSecrets(`${header}\nabc\n`)[0]?.kind).toBe("private key block");
  });

  it("should detect a JSON Web Token", () => {
    const jwt = [repeat("eyJ", "a", 20), repeat("eyJ", "b", 20), "c".repeat(20)].join(".");
    expect(findSecrets(jwt)[0]?.kind).toBe("JSON Web Token");
  });

  it("should point at the value of a credential assignment, not at its name", () => {
    const text = `export API_KEY="${"s3cret-value-long-enough"}"`;
    const [finding] = findSecrets(text);
    expect(finding?.kind).toBe("credential assignment");
    expect(finding?.token).toBe("s3cret-value-long-enough");
  });

  it("should report one finding for a token that satisfies two shapes", () => {
    expect(findSecrets(`key ${repeat("sk-ant-", "d", 40)}`)).toHaveLength(1);
    expect(findSecrets(`GITHUB_TOKEN=${repeat("ghp_", "a", 36)}`)).toHaveLength(1);
  });

  it("should return the same findings when called twice over the same text", () => {
    const text = `use ${repeat("ghp_", "a", 36)} here`;
    expect(findSecrets(text)).toEqual(findSecrets(text));
    expect(findSecrets(text)).toHaveLength(1);
  });

  it.each([
    ["an empty composer", ""],
    ["ordinary prose", "Please re-run the gate and report the counts."],
    ["a Beads display id", "Work BU-beads-ui-web-app-aeyb next."],
    ["a commit sha", "Pin it to 2b3e2ea5c1d4e7f80912345678901234567890a."],
    ["a file path", "Read apps/web/server/dispatch.ts in full."],
    ["a slash command", "/beads-task BU-mg2.5.4 --no-delegation"],
    ["a short assignment", "set PORT=8400"],
  ])("should not refuse %s", (_label, text) => {
    expect(findSecrets(text)).toEqual([]);
  });
});

describe("describeRefusal", () => {
  it("should name the rule and the position and must not echo the secret value", () => {
    const message = describeRefusal(findSecrets(`then ${FAKE_AWS_KEY}`)[0] as never);
    expect(message).toContain("AWS access key id");
    expect(message).toContain("line 1");
    expect(message).toContain("column 6");
    expect(message).not.toContain(FAKE_AWS_KEY);
  });
});
