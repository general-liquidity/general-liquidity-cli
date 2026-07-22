import { parseArgs } from "node:util";
import { canonicalBytes, type Intent, type Signer } from "@general-liquidity/sdk";
import { buildClient } from "../internal/client.ts";
import { resolveRuntime } from "../internal/config.ts";
import type { Context } from "../internal/context.ts";
import { CliError } from "../internal/errors.ts";
import { printJson } from "../internal/output.ts";
import { ed25519SignerFromSeed } from "../internal/signer.ts";

// Live Base Sepolia governed settlement. Adapted from platform scripts/testnet-pay.ts:
// env-driven, refuses without the required secrets, and refuses a non-testnet chain
// unless GL_ALLOW_MAINNET=1 (keyed on chain id, not a label, so a renamed config cannot
// slip past it). The CLI is an operator tool: it signs and submits a governed on-chain
// USDC Intent through the SDK to the running GL server, which holds the settle primitive
// and the x402 facilitator. No mock rail or mock facilitator exists on this path.

interface Network {
  network: string;
  chainId: number;
}

const NETWORKS: Record<string, Network> = {
  "base-sepolia": { network: "eip155:84532", chainId: 84532 },
  base: { network: "eip155:8453", chainId: 8453 },
};

const TESTNET_CHAIN_IDS = new Set([84532]);
const DEFAULT_AMOUNT_ATOMIC = "1000";
const DEFAULT_MANDATE_ID = "m_testnet_settlement_probe";
const GRANT_TTL_MS = 24 * 60 * 60 * 1000;

/** gl testnet-pay - governed live settlement on Base Sepolia via the GL server. */
export async function testnetPayCmd(argv: string[], ctx: Context): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { pretty: { type: "boolean" } },
    allowPositionals: false,
  });
  const rt = resolveRuntime(ctx);

  const signerKey = rt.signerKey;
  const facilitatorUrl = ctx.env["GL_FACILITATOR_URL"]?.trim();
  const payTo = ctx.env["GL_PAY_TO"]?.trim();

  const missing: string[] = [];
  if (!signerKey) missing.push(`${rt.signerKeyEnv} (operator signing key, hex ed25519 seed)`);
  if (!facilitatorUrl) missing.push("GL_FACILITATOR_URL (x402 facilitator base URL)");
  if (!payTo) missing.push("GL_PAY_TO (0x recipient address)");
  if (missing.length > 0) {
    throw new CliError(
      `refusing to run - ${missing.length} required environment variable(s) missing:\n  ${missing.join("\n  ")}`,
    );
  }

  try {
    const url = new URL(facilitatorUrl as string);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("bad protocol");
  } catch {
    throw new CliError(`GL_FACILITATOR_URL is not a valid URL: "${facilitatorUrl}"`);
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(payTo as string)) {
    throw new CliError(`GL_PAY_TO must be a 0x EVM address, got "${payTo}"`);
  }

  const networkKey = (ctx.env["GL_NETWORK"] ?? "base-sepolia").trim();
  const network = NETWORKS[networkKey];
  if (!network) {
    throw new CliError(
      `unknown GL_NETWORK "${networkKey}" - supported: ${Object.keys(NETWORKS).join(", ")}`,
    );
  }
  const isTestnet = TESTNET_CHAIN_IDS.has(network.chainId);
  if (!isTestnet && ctx.env["GL_ALLOW_MAINNET"] !== "1") {
    throw new CliError(
      `refusing to run against ${networkKey} (chain ${network.chainId}) - this is NOT a testnet. ` +
        "Real funds would move. Set GL_ALLOW_MAINNET=1 to override.",
    );
  }

  const amountAtomic = (ctx.env["GL_AMOUNT_ATOMIC"] ?? DEFAULT_AMOUNT_ATOMIC).trim();
  if (!/^[1-9][0-9]*$/.test(amountAtomic)) {
    throw new CliError(
      `GL_AMOUNT_ATOMIC must be a positive integer of atomic USDC units, got "${amountAtomic}"`,
    );
  }
  const mandateId = (ctx.env["GL_MANDATE"] ?? DEFAULT_MANDATE_ID).trim();

  const signer: Signer = ed25519SignerFromSeed(signerKey as string);
  const identity = signer.agentId ?? "";
  const expiresAt = new Date(ctx.now().getTime() + GRANT_TTL_MS).toISOString();
  const grantCore = { agentId: identity, mandateId, expiresAt };
  const grantSignature = await signer.sign(canonicalBytes(grantCore));

  const intent: Intent = {
    idempotencyKey: `testnet-${ctx.now().getTime()}`,
    payee: payTo as string,
    amount: { value: amountAtomic, asset: "USDC" },
    purpose: "live testnet settlement probe - governed x402 payment through the gate",
    terms: {
      reversibility: "irreversible",
      finality: "instant",
      credential: "eip3009",
      rail: "x402",
      capitalSource: "payer",
      presence: "delegated",
    },
    envelope: {
      identity,
      mandateId,
      grant: { ...grantCore, signature: grantSignature },
      signature: "",
    },
  };

  ctx.err(
    `network=${network.network} mode=${isTestnet ? "TESTNET" : "MAINNET (real funds)"} ` +
      `facilitator=${facilitatorUrl} payTo=${payTo} amountAtomic=${amountAtomic}`,
  );

  const client = buildClient(ctx, rt, signer);
  const receipt = await client.pay(intent);
  printJson(ctx, receipt, Boolean(values.pretty));
  return 0;
}
