import { parseArgs } from "node:util";
import type { Context } from "../internal/context.ts";
import { CliError } from "../internal/errors.ts";
import { operatorClientFrom, requireRationale } from "../internal/operator.ts";
import { printJson } from "../internal/output.ts";

/**
 * gl refund - reverse a settled payment over the operator channel. --amount-minor names
 * a partial refund in minor units; omitted, the full outstanding amount is reversed. An
 * irreversible settlement is refused by the kernel and exits non-zero with the problem.
 */
export async function refundCmd(argv: string[], ctx: Context): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      "intent-id": { type: "string" },
      "amount-minor": { type: "string" },
      rationale: { type: "string" },
      key: { type: "string" },
      "key-id": { type: "string" },
      pretty: { type: "boolean" },
    },
    allowPositionals: false,
  });

  const intentId = values["intent-id"];
  if (!intentId) {
    throw new CliError("usage: gl refund --intent-id <id> --rationale <why> [--amount-minor <n>]");
  }
  const rationale = requireRationale(values.rationale);

  let amountMinor: number | undefined;
  if (typeof values["amount-minor"] === "string") {
    amountMinor = Number(values["amount-minor"]);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      throw new CliError("--amount-minor must be a positive number");
    }
  }

  const client = await operatorClientFrom(ctx, values);
  const result = await client.refund({
    intentId,
    rationale,
    ...(amountMinor !== undefined ? { amountMinor } : {}),
  });
  printJson(ctx, result, Boolean(values.pretty));
  return 0;
}
