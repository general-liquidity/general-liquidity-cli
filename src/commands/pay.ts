import { parseArgs } from "node:util";
import { canonicalBytes, type Intent, type Signer } from "@general-liquidity/sdk";
import { buildClient } from "../internal/client.ts";
import { resolveRuntime } from "../internal/config.ts";
import type { Context } from "../internal/context.ts";
import { CliError } from "../internal/errors.ts";
import { printJson } from "../internal/output.ts";
import { ed25519SignerFromSeed } from "../internal/signer.ts";
import { CAPITAL_SOURCE, FINALITY, PRESENCE, RAILS, REVERSIBILITY } from "../internal/wire.ts";

const GRANT_TTL_MS = 24 * 60 * 60 * 1000;

function required(values: Record<string, unknown>, name: string): string {
  const v = values[name];
  if (typeof v !== "string" || v.length === 0) {
    throw new CliError(`missing required flag --${name}`);
  }
  return v;
}

function oneOf<T extends readonly string[]>(
  values: Record<string, unknown>,
  name: string,
  allowed: T,
): T[number] {
  const v = required(values, name);
  if (!(allowed as readonly string[]).includes(v)) {
    throw new CliError(`--${name} must be one of: ${allowed.join(", ")} (got "${v}")`);
  }
  return v as T[number];
}

/**
 * gl pay - build a governed pay Intent from flags and submit it. The operator key signs
 * the grant and the SDK signs the Intent envelope; the sovereign gate on the server
 * decides and, on allow, settles and returns a Receipt. On deny the server's RFC 7807
 * problem is printed. The six Terms are required flags, never silently defaulted.
 */
export async function payCmd(argv: string[], ctx: Context): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      payee: { type: "string" },
      amount: { type: "string" },
      asset: { type: "string" },
      purpose: { type: "string" },
      rail: { type: "string" },
      reversibility: { type: "string" },
      finality: { type: "string" },
      credential: { type: "string" },
      "capital-source": { type: "string" },
      presence: { type: "string" },
      mandate: { type: "string" },
      expires: { type: "string" },
      "idempotency-key": { type: "string" },
      pretty: { type: "boolean" },
    },
    allowPositionals: false,
  });

  const rt = resolveRuntime(ctx);
  if (!rt.signerKey) {
    throw new CliError(`no signer key: set ${rt.signerKeyEnv} to sign the pay intent`);
  }
  const signer: Signer = ed25519SignerFromSeed(rt.signerKey);
  const identity = signer.agentId ?? "";

  const payee = required(values, "payee");
  const amount = required(values, "amount");
  const asset = required(values, "asset");
  const purpose = required(values, "purpose");
  const mandateId = required(values, "mandate");
  const terms: Intent["terms"] = {
    rail: oneOf(values, "rail", RAILS),
    reversibility: oneOf(values, "reversibility", REVERSIBILITY),
    finality: oneOf(values, "finality", FINALITY),
    credential: required(values, "credential"),
    capitalSource: oneOf(values, "capital-source", CAPITAL_SOURCE),
    presence: oneOf(values, "presence", PRESENCE),
  };

  const expiresAt =
    typeof values.expires === "string" && values.expires.length > 0
      ? values.expires
      : new Date(ctx.now().getTime() + GRANT_TTL_MS).toISOString();

  const grantCore = { agentId: identity, mandateId, expiresAt };
  const grantSignature = await signer.sign(canonicalBytes(grantCore));

  const intent: Intent = {
    idempotencyKey: typeof values["idempotency-key"] === "string" ? values["idempotency-key"] : "",
    payee,
    amount: { value: amount, asset },
    purpose,
    terms,
    envelope: {
      identity,
      mandateId,
      grant: { ...grantCore, signature: grantSignature },
      // Filled by the SDK's signIntent over the canonical Intent.
      signature: "",
    },
  };

  const client = buildClient(ctx, rt, signer);
  const receipt = await client.pay(intent);
  printJson(ctx, receipt, Boolean(values.pretty));
  return 0;
}
