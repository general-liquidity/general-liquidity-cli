import { createPrivateKey, createPublicKey, sign as nodeSign } from "node:crypto";
import type { Signer } from "@general-liquidity/sdk";
import { CliError } from "./errors.ts";

// The operator signer. The SDK signs the Intent envelope with an operator-held key and
// never sees the raw key material beyond the sign(bytes) call. GL's agentId "equals the
// ed25519 public key", so the operator key is a 32-byte ed25519 seed and the derived
// public key is the identity.
//
// The seed is wrapped into a PKCS8 DER document (the fixed 16-byte ed25519 prefix plus
// the seed) so node:crypto can load it; the public key is exported as SPKI and the fixed
// 12-byte prefix stripped to recover the raw 32-byte key.

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI_ED25519_PREFIX_LEN = 12;

function normalizeSeed(key: string): Buffer {
  const hex = key.startsWith("0x") ? key.slice(2) : key;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new CliError(
      "signer key must be a 32-byte ed25519 seed as 64 hex chars (optionally 0x-prefixed). Value not echoed.",
    );
  }
  return Buffer.from(hex, "hex");
}

/** Build an operator ed25519 Signer from a hex seed. The key stays in this process. */
export function ed25519SignerFromSeed(key: string): Signer {
  const seed = normalizeSeed(key);
  const privateKey = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
  // createPublicKey derives the public key from the private KeyObject at runtime; the
  // cast bridges a @types/bun overload gap that omits the KeyObject input.
  const publicKey = createPublicKey(privateKey as unknown as Parameters<typeof createPublicKey>[0]);
  const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const agentId = spki.subarray(SPKI_ED25519_PREFIX_LEN).toString("hex");

  return {
    agentId,
    sign(bytes: Uint8Array): string {
      return nodeSign(null, Buffer.from(bytes), privateKey).toString("base64");
    },
  };
}

/**
 * A signer that refuses to sign. Handed to the SDK client for read-only calls
 * (resolve / verify / audit) that never reach a sign(), so those commands work with no
 * operator key present. pay / disclose / testnet-pay build a real signer instead.
 */
export const absentSigner: Signer = {
  sign(): never {
    throw new CliError("no signer key available for this operation");
  },
};
