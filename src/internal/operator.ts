import {
  createOperatorClient,
  type OperatorClient,
  operatorSignerFromSeed,
} from "@general-liquidity/sdk";
import { type Runtime, requireBaseUrl, resolveRuntime } from "./config.ts";
import type { Context } from "./context.ts";
import { CliError } from "./errors.ts";

// Operator authority is a SEPARATE credential domain from the agent's API key: it is a
// detached ed25519 signature, never a bearer token. The operator seed and its key id are
// read from the environment or a `--key` file ONLY — never a flag value (which would land
// in shell history), never hardcoded, never logged. The seed is not echoed on any error.

/** Env var holding the operator ed25519 seed (32-byte hex). */
const OPERATOR_KEY_ENV = "GL_OPERATOR_KEY";
/** Env var holding the operator key id the server has registered. */
const OPERATOR_KEY_ID_ENV = "GL_OPERATOR_KEY_ID";

export interface OperatorArgs {
  /** Path to a file holding the operator seed (hex). Alternative to the env var. */
  key?: unknown;
  /** The operator key id, if not taken from the env. */
  "key-id"?: unknown;
}

function readSeed(ctx: Context, args: OperatorArgs): string {
  const keyPath = typeof args.key === "string" && args.key.length > 0 ? args.key : undefined;
  if (keyPath) {
    const raw = ctx.readFile(keyPath);
    if (!raw) throw new CliError(`operator key file not found or empty: ${keyPath}`);
    const seed = raw.trim();
    if (seed.length === 0) throw new CliError(`operator key file is empty: ${keyPath}`);
    return seed;
  }
  const fromEnv = ctx.env[OPERATOR_KEY_ENV]?.trim();
  if (!fromEnv) {
    throw new CliError(
      `no operator key: set ${OPERATOR_KEY_ENV} to the operator ed25519 seed, or pass --key <path>`,
    );
  }
  return fromEnv;
}

function readKeyId(ctx: Context, args: OperatorArgs): string {
  const fromFlag =
    typeof args["key-id"] === "string" && args["key-id"].length > 0 ? args["key-id"] : undefined;
  const keyId = fromFlag ?? ctx.env[OPERATOR_KEY_ID_ENV]?.trim();
  if (!keyId) {
    throw new CliError(
      `no operator key id: set ${OPERATOR_KEY_ID_ENV} or pass --key-id <id> (the id the server registered for your key)`,
    );
  }
  return keyId;
}

/**
 * Resolve the operator client: base URL from the runtime, the operator signer from the
 * seed + key id. The operator client does NOT carry the agent API key — operator
 * authority is the `GL-Operator` signature alone. Throws a clean CliError (exit 2) when
 * the key material or server is missing; never leaks the seed.
 */
export async function operatorClientFrom(
  ctx: Context,
  args: OperatorArgs,
): Promise<OperatorClient> {
  const rt: Runtime = resolveRuntime(ctx);
  const baseUrl = requireBaseUrl(rt);
  const seed = readSeed(ctx, args);
  const keyId = readKeyId(ctx, args);

  let signer: Awaited<ReturnType<typeof operatorSignerFromSeed>>;
  try {
    signer = await operatorSignerFromSeed(keyId, seed);
  } catch {
    // Do NOT include the caught error: it could echo the seed. State only the shape.
    throw new CliError(
      "operator key is invalid: expected a 32-byte ed25519 seed as 64 hex chars (optionally 0x-prefixed). Value not echoed.",
    );
  }

  return createOperatorClient({ baseUrl, signer, fetch: ctx.fetchImpl });
}

/** Enforce the server's minimum rationale length locally, so a refusal is not a round trip. */
export function requireRationale(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 10) {
    throw new CliError("--rationale is required and must be at least 10 characters");
  }
  return value;
}
