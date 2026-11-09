import { createHash, createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import type { DispatchRecord } from "@beads-ui/core";
import { describe, expect, it } from "vitest";
import {
  canonicalBytes,
  checkSignedRecord,
  MalformedDispatch,
  type SigningKeySource,
  signDispatch,
  signingKeySource,
  type UnsignedDispatch,
} from "../server/envelope.ts";

// The receiving side's golden vectors, copied byte for byte from the verifier's repository.
const VECTORS_URL = new URL("./fixtures/dispatch-envelope-v1.json", import.meta.url);
const VECTORS_SHA256 = "ba1ee2f557c4adb09cac31d8e459a564727bb0fa6785c2d16a7e78acaf6dcaf9";
const vectorsBytes = readFileSync(VECTORS_URL);

interface Vector {
  name: string;
  record: Record<string, unknown>;
  body_utf8: string;
  canonical_utf8?: string;
  expect_reason?: string;
}
const vectors = JSON.parse(vectorsBytes.toString("utf8")) as {
  seed_hex: string;
  key_id: string;
  public_key: string;
  valid: Vector[];
  invalid: Vector[];
};

/** RFC 8032 section 7.1 TEST 2: a second published test key, never a real one. */
const OTHER_SEED_HEX = "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb";

const seedSource = (keyId: string): SigningKeySource =>
  signingKeySource(async () => ({ keyId, secret: vectors.seed_hex }));

const UNSIGNED_KEYS = [
  "id",
  "task",
  "target",
  "kind",
  "body_ref",
  "body_digest",
  "arm_goal",
  "created_by",
  "created_at",
  "expires_at",
] as const;

function unsignedOf(record: Record<string, unknown>): UnsignedDispatch {
  return Object.fromEntries(UNSIGNED_KEYS.map((key) => [key, record[key]])) as UnsignedDispatch;
}

const sample = (): UnsignedDispatch => unsignedOf(vectors.valid[0]?.record ?? {});

function verifiesWith(publicKeyB64url: string, record: DispatchRecord): boolean {
  const publicKey = createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: publicKeyB64url },
    format: "jwk",
  });
  return verify(
    null,
    canonicalBytes(record),
    publicKey,
    Buffer.from(record.envelope.signature, "base64url"),
  );
}

describe("the shared golden vectors", () => {
  it("should be the verifier's file byte for byte when the copy is hashed", () => {
    expect(createHash("sha256").update(vectorsBytes).digest("hex")).toBe(VECTORS_SHA256);
  });

  it("should hold valid vectors and a malformed vector for each shape refusal when read", () => {
    expect(vectors.valid.length).toBeGreaterThan(0);
    expect(vectors.invalid.filter((v) => v.expect_reason === "malformed").length).toBeGreaterThan(
      0,
    );
  });
});

describe("signing a dispatch (T-W0.4)", () => {
  it.each(vectors.valid.map((v) => [v.name, v] as const))(
    "should reproduce the canonical bytes and signature of vector %s when signed from its seed",
    async (_name, vector) => {
      const keyId = vector.record.signing_key_id as string;
      const signed = await signDispatch(unsignedOf(vector.record), seedSource(keyId));
      expect(canonicalBytes(signed).toString("utf8")).toBe(vector.canonical_utf8);
      expect(signed.envelope).toEqual(vector.record.envelope);
    },
  );

  it.each(
    vectors.invalid.filter((v) => v.expect_reason === "malformed").map((v) => [v.name, v] as const),
  )(
    "should refuse the malformed vector %s when asked to check it as a signed record",
    (_name, vector) => {
      expect(() => checkSignedRecord(vector.record)).toThrow(MalformedDispatch);
    },
  );

  it("should accept every valid vector when it is checked as a signed record", () => {
    for (const vector of vectors.valid)
      expect(() => checkSignedRecord(vector.record)).not.toThrow();
  });

  it("should put the key id inside the signed bytes and the envelope when it signs", async () => {
    const signed = await signDispatch(sample(), seedSource("host-a-20261109"));
    const canonical = JSON.parse(canonicalBytes(signed).toString("utf8")) as Record<
      string,
      unknown
    >;
    expect(canonical.signing_key_id).toBe("host-a-20261109");
    expect(signed.signing_key_id).toBe("host-a-20261109");
    expect(signed.envelope.signing_key_id).toBe("host-a-20261109");
    const relabelled = { ...signed, signing_key_id: "host-a-20261110" };
    expect(verifiesWith(vectors.public_key, signed)).toBe(true);
    expect(verifiesWith(vectors.public_key, relabelled)).toBe(false);
  });

  it("should sign the RFC 8785 form of exactly the signed fields when the record carries more", async () => {
    const signed = await signDispatch(sample(), seedSource(vectors.key_id));
    const withState = { ...signed, state: "taken" };
    expect(canonicalBytes(withState).equals(canonicalBytes(signed))).toBe(true);
    const text = canonicalBytes(signed).toString("utf8");
    expect(text).not.toContain(" ");
    expect(Object.keys(JSON.parse(text) as object)).toEqual(
      [...Object.keys(signed)].filter((k) => k !== "envelope").sort(),
    );
  });

  it("should read the signing key on every call when the configured secret is rotated", async () => {
    let current = { keyId: "host-a-20261109", secret: vectors.seed_hex };
    const source = signingKeySource(async () => current);
    const first = await signDispatch(sample(), source);
    current = { keyId: "host-a-20261110", secret: OTHER_SEED_HEX };
    const second = await signDispatch(sample(), source);
    expect(first.envelope.signing_key_id).toBe("host-a-20261109");
    expect(second.envelope.signing_key_id).toBe("host-a-20261110");
    expect(verifiesWith(vectors.public_key, first)).toBe(true);
    expect(verifiesWith(vectors.public_key, second)).toBe(false);
  });

  it("should sign with a PKCS #8 key when the secret is a PEM", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const signed = await signDispatch(
      sample(),
      signingKeySource(async () => ({ keyId: "host-a-20261109", secret: pem })),
    );
    const x = publicKey.export({ format: "jwk" }).x as string;
    expect(verifiesWith(x, signed)).toBe(true);
  });

  it.each([
    ["a timestamp without milliseconds", { created_at: "2026-11-09T04:38:32Z" }],
    ["a timestamp with an offset", { expires_at: "2026-11-09T06:38:32.636+00:00" }],
    ["a day the calendar does not have", { expires_at: "2026-02-30T06:38:32.636Z" }],
    ["an unknown kind", { kind: "shell" }],
    ["a task with an extra key", { task: { repo: "demo-repo", id: "demo-1", x: "y" } }],
    ["an empty target session", { target: { session: "", host: "test-host" } }],
    ["an id that is not a ULID", { id: "not-a-ulid" }],
    ["a digest in upper case", { body_digest: `sha256:${"A".repeat(64)}` }],
    ["arm_goal as a string", { arm_goal: "true" }],
    ["a number where a string goes", { created_by: 7 }],
    ["a lone surrogate", { body_ref: "prompt-store:\ud800" }],
  ])("should refuse to sign a record with %s", async (_what, change) => {
    const fields = { ...sample(), ...change } as UnsignedDispatch;
    await expect(signDispatch(fields, seedSource(vectors.key_id))).rejects.toThrow(
      MalformedDispatch,
    );
  });

  it("should refuse to sign a record missing a signed field", async () => {
    const { body_ref: _dropped, ...fields } = sample();
    await expect(
      signDispatch(fields as UnsignedDispatch, seedSource(vectors.key_id)),
    ).rejects.toThrow("record has no body_ref");
  });

  it("should refuse to sign when the configured key id is empty", async () => {
    await expect(signDispatch(sample(), seedSource(""))).rejects.toThrow(
      "[auth] signing_key_id is empty",
    );
  });

  it.each([
    ["text that is no key", "not a key"],
    [
      "a non-Ed25519 key",
      generateKeyPairSync("ec", { namedCurve: "P-256" })
        .privateKey.export({ format: "pem", type: "pkcs8" })
        .toString(),
    ],
  ])("should refuse to sign when the secret is %s", async (_what, secret) => {
    await expect(
      signDispatch(
        sample(),
        signingKeySource(async () => ({ keyId: "host-a-20261109", secret })),
      ),
    ).rejects.toThrow(MalformedDispatch);
  });
});
