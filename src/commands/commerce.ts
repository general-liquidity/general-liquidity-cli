import { parseArgs } from "node:util";
import type { QuoteRequest } from "@general-liquidity/sdk";
import { buildClient } from "../internal/client.ts";
import { resolveRuntime } from "../internal/config.ts";
import type { Context } from "../internal/context.ts";
import { CliError } from "../internal/errors.ts";
import { printJson } from "../internal/output.ts";
import { absentSigner } from "../internal/signer.ts";
import { CHECKOUT_RAILS } from "../internal/wire.ts";

// The commerce tier, read half. `gl buy` is deliberately ABSENT: the buy envelope carries a
// signature the gate verifies, but the intent the gate evaluates is constructed server-side
// from the merchant's own cart, so the CLI cannot build the signed preimage the way `pay`
// does through the SDK's `signIntent`. Shipping a `buy` that guesses that preimage would
// emit requests the gate refuses, which is worse than not shipping it. Add it once the
// envelope's signing input is pinned down; `quote` needs no signer and is complete today.

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
 * `--line <itemId>:<quantity>`, repeatable. Quantity is a positive integer: zero and
 * fractional counts are refused HERE rather than sent on, because a cart the merchant
 * rejects costs a round trip and reports the failure in the merchant's vocabulary instead of
 * this one's. The separator is the LAST colon, so an item id may contain one.
 */
function parseLines(raw: string[]): QuoteRequest["lines"] {
  if (raw.length === 0) throw new CliError("at least one --line <itemId>:<quantity> is required");
  return raw.map((entry) => {
    const sep = entry.lastIndexOf(":");
    if (sep <= 0) throw new CliError(`--line must be <itemId>:<quantity> (got "${entry}")`);
    const id = entry.slice(0, sep);
    const qty = entry.slice(sep + 1);
    if (!/^[1-9][0-9]*$/.test(qty)) {
      throw new CliError(`--line quantity must be a positive integer (got "${qty}" in "${entry}")`);
    }
    return { id, quantity: Number(qty) };
  });
}

/**
 * gl quote - price a cart against a merchant over a checkout protocol. Commits nothing and
 * moves no money, so it needs no signer and no mandate: it returns the server-authoritative
 * Cart the merchant priced. Only a Cart in status `ready` can be bought; every other status
 * reports what the checkout still needs.
 *
 * The commerce tier is opt-in per deployment. A stack that did not enable it answers
 * `not_found`, printed as the same structured problem as any other refusal.
 */
export async function quoteCmd(argv: string[], ctx: Context): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      rail: { type: "string" },
      merchant: { type: "string" },
      currency: { type: "string" },
      line: { type: "string", multiple: true },
      pretty: { type: "boolean" },
    },
    allowPositionals: false,
  });

  const rt = resolveRuntime(ctx);
  const client = buildClient(ctx, rt, absentSigner);
  const cart = await client.quote({
    rail: oneOf(values, "rail", CHECKOUT_RAILS),
    merchant: required(values, "merchant"),
    currency: required(values, "currency"),
    lines: parseLines(values.line ?? []),
  });
  printJson(ctx, cart, Boolean(values.pretty));
  return 0;
}
