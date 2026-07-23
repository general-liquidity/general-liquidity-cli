import { parseArgs } from "node:util";
import type { Context } from "../internal/context.ts";
import { CliError } from "../internal/errors.ts";
import { operatorClientFrom, requireRationale } from "../internal/operator.ts";
import { printJson } from "../internal/output.ts";

/**
 * gl approve - release one parked (confirm-tier) intent over the operator channel. The
 * intentId, challenge and mandateId are exactly the fields the server's approval.pending
 * problem hands back; --ack is the explicit challenge-response acknowledgement, never
 * inferred. On settle the Receipt is printed; a withheld challenge or a refusal exits
 * non-zero with the server's problem.
 */
export async function approveCmd(argv: string[], ctx: Context): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      "intent-id": { type: "string" },
      challenge: { type: "string" },
      mandate: { type: "string" },
      rationale: { type: "string" },
      ack: { type: "boolean" },
      key: { type: "string" },
      "key-id": { type: "string" },
      pretty: { type: "boolean" },
    },
    allowPositionals: false,
  });

  const intentId = values["intent-id"];
  const challenge = values.challenge;
  const mandateId = values.mandate;
  if (!intentId || !challenge || !mandateId) {
    throw new CliError(
      "usage: gl approve --intent-id <id> --challenge <c> --mandate <m> --rationale <why> [--ack]",
    );
  }
  const rationale = requireRationale(values.rationale);

  const client = await operatorClientFrom(ctx, values);
  const receipt = await client.approve({
    intentId,
    challenge,
    mandateId,
    rationale,
    acknowledged: Boolean(values.ack),
  });
  printJson(ctx, receipt, Boolean(values.pretty));
  return 0;
}
