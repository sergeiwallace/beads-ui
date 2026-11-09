// The dispatch envelope's signing side (web app design T-W0.4, D-8, D-20, Data Model → Envelope
// wire format). The signing input is the RFC 8785 canonical JSON, UTF-8, of exactly SIGNED_FIELDS;
// the signature is Ed25519 by the serving host's key, read at call time. The golden vectors the
// receiving side's verifier ships pin these bytes for both ends.

import { createHash, createPrivateKey, type KeyObject, sign } from "node:crypto";
import {
  DISPATCH_KINDS,
  type DispatchEnvelope,
  type DispatchRecord,
  type SignedDispatchFields,
} from "@beads-ui/core";

export const ENVELOPE_VERSION = 1;

export const SIGNED_FIELDS = [
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
  "signing_key_id",
] as const satisfies readonly (keyof SignedDispatchFields)[];

/** The record or its envelope does not have the version 1 shape; nothing is signed or stored. */
export class MalformedDispatch extends Error {
  override name = "MalformedDispatch";
}

const TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const BASE64URL = /^[A-Za-z0-9_-]*$/;
// Under the u flag a surrogate pair is one code point, so only an unpaired surrogate matches.
const LONE_SURROGATE = /\p{Cs}/u;
const SIGNATURE_BYTES = 64;
const SEED_BYTES = 32;
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

type Plain = Record<string, unknown>;

function isPlainObject(value: unknown): value is Plain {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const isText = (value: unknown): value is string => typeof value === "string" && value !== "";

/** The contract's timestamp: UTC RFC 3339 to the millisecond, naming a real instant. */
export function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !TIMESTAMP.test(value)) return false;
  const moment = new Date(value);
  return !Number.isNaN(moment.getTime()) && moment.toISOString() === value;
}

/** `moment` in the contract's timestamp form, to the millisecond. */
export const formatTimestamp = (moment: Date): string => moment.toISOString();

const pair =
  (first: string, second: string) =>
  (value: unknown): boolean =>
    isPlainObject(value) &&
    Object.keys(value).length === 2 &&
    isText(value[first]) &&
    isText(value[second]);

const FIELD_CHECKS: Record<(typeof SIGNED_FIELDS)[number], (value: unknown) => boolean> = {
  id: (value) => typeof value === "string" && ULID.test(value),
  task: pair("repo", "id"),
  target: pair("session", "host"),
  kind: (value) =>
    typeof value === "string" && (DISPATCH_KINDS as readonly string[]).includes(value),
  body_ref: isText,
  body_digest: (value) => typeof value === "string" && DIGEST.test(value),
  arm_goal: (value) => typeof value === "boolean",
  created_by: isText,
  created_at: isTimestamp,
  expires_at: isTimestamp,
  signing_key_id: isText,
};

/** The `body_digest` value for the exact body bytes. */
export const bodyDigest = (body: Uint8Array): string =>
  `sha256:${createHash("sha256").update(body).digest("hex")}`;

/**
 * RFC 8785 canonical JSON for the values a signed dispatch holds: objects, strings and booleans.
 * Keys sort by UTF-16 code unit, which is how JavaScript compares strings, and `JSON.stringify` of a
 * string is exactly the escaping RFC 8785 specifies. A lone surrogate has no UTF-8 form, so it is
 * refused rather than replaced.
 */
export function canonicalJson(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    if (LONE_SURROGATE.test(value))
      throw new MalformedDispatch("a signed string is not valid Unicode");
    return JSON.stringify(value);
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${canonicalJson(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new MalformedDispatch(`${typeof value} is not part of the signed shape`);
}

/** The signed object, taken from the record's top level after checking every field's shape. */
export function signedFields(record: unknown): SignedDispatchFields {
  if (!isPlainObject(record)) throw new MalformedDispatch("record is not an object");
  const fields: Plain = {};
  for (const name of SIGNED_FIELDS) {
    if (!Object.hasOwn(record, name)) throw new MalformedDispatch(`record has no ${name}`);
    if (!FIELD_CHECKS[name](record[name]))
      throw new MalformedDispatch(`record ${name} has the wrong shape`);
    fields[name] = record[name];
  }
  return fields as unknown as SignedDispatchFields;
}

/** The exact signing input: the canonical JSON of the signed fields, UTF-8. */
export const canonicalBytes = (record: unknown): Buffer =>
  Buffer.from(canonicalJson(signedFields(record)), "utf8");

/** The record's envelope, after checking it is a version 1 envelope naming the signed key id. */
export function parseEnvelope(record: unknown): DispatchEnvelope {
  const envelope = isPlainObject(record) ? record.envelope : undefined;
  if (!isPlainObject(envelope)) throw new MalformedDispatch("record has no envelope");
  const keys = Object.keys(envelope).sort().join(",");
  if (keys !== "signature,signing_key_id,version")
    throw new MalformedDispatch("envelope is not a version 1 envelope");
  if (envelope.version !== ENVELOPE_VERSION)
    throw new MalformedDispatch("envelope version is not 1");
  if (!isText(envelope.signing_key_id))
    throw new MalformedDispatch("envelope signing_key_id has the wrong shape");
  const { signature } = envelope;
  if (
    typeof signature !== "string" ||
    !BASE64URL.test(signature) ||
    Buffer.from(signature, "base64url").length !== SIGNATURE_BYTES ||
    Buffer.from(signature, "base64url").toString("base64url") !== signature
  )
    throw new MalformedDispatch("envelope signature has the wrong shape");
  return { version: ENVELOPE_VERSION, signing_key_id: envelope.signing_key_id, signature };
}

/**
 * `record` as a stored dispatch record, or MalformedDispatch: every signed field has its shape, the
 * envelope is version 1, and it names the key id the record signs.
 */
export function checkSignedRecord(record: unknown): DispatchRecord {
  const fields = signedFields(record);
  canonicalJson(fields);
  const envelope = parseEnvelope(record);
  if (envelope.signing_key_id !== fields.signing_key_id)
    throw new MalformedDispatch("envelope signing_key_id differs from the signed signing_key_id");
  return { ...fields, envelope };
}

/** An Ed25519 private key from its secret text: a PKCS #8 PEM, or the 32-byte seed in hex. */
export function signingKeyFromSecret(secret: string): KeyObject {
  const text = secret.trim();
  let key: KeyObject;
  if (/^[0-9a-fA-F]{64}$/.test(text)) {
    key = createPrivateKey({
      key: Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(text, "hex")]),
      format: "der",
      type: "pkcs8",
    });
  } else {
    try {
      key = createPrivateKey({ key: text, format: "pem" });
    } catch {
      throw new MalformedDispatch(
        `the signing key is neither a PKCS #8 PEM nor a ${SEED_BYTES}-byte hex seed`,
      );
    }
  }
  if (key.asymmetricKeyType !== "ed25519")
    throw new MalformedDispatch("the signing key is not an Ed25519 key");
  return key;
}

export interface SigningKey {
  keyId: string;
  privateKey: KeyObject;
}

/** The serving host's signing key, fetched afresh on every call so a rotation needs no restart. */
export type SigningKeySource = () => Promise<SigningKey>;

/**
 * A source that reads `[auth] signing_key_id` and the secret `[auth] signing_key` names each time
 * it is called; `read` resolves the configured reference to the secret's text.
 */
export function signingKeySource(
  read: () => Promise<{ keyId: string; secret: string }>,
): SigningKeySource {
  return async () => {
    const { keyId, secret } = await read();
    if (!isText(keyId)) throw new MalformedDispatch("[auth] signing_key_id is empty");
    return { keyId, privateKey: signingKeyFromSecret(secret) };
  };
}

/** The unsigned dispatch: every signed field but the key id, which the key source supplies. */
export type UnsignedDispatch = Omit<SignedDispatchFields, "signing_key_id">;

/**
 * Signs `fields` with the key `source` returns now: the key id goes inside the signed bytes and
 * into the envelope. A record whose shape is malformed is refused before anything is signed.
 */
export async function signDispatch(
  fields: UnsignedDispatch,
  source: SigningKeySource,
): Promise<DispatchRecord> {
  const { keyId, privateKey } = await source();
  const signed = signedFields({ ...fields, signing_key_id: keyId });
  const signature = sign(null, canonicalBytes(signed), privateKey).toString("base64url");
  return {
    ...signed,
    envelope: { version: ENVELOPE_VERSION, signing_key_id: keyId, signature },
  };
}
