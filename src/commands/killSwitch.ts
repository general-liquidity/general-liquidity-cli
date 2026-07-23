import { parseArgs } from "node:util";
import type { Context } from "../internal/context.ts";
import { CliError } from "../internal/errors.ts";
import { operatorClientFrom, requireRationale } from "../internal/operator.ts";
import { printJson } from "../internal/output.ts";

/**
 * gl kill-switch <engage|disengage> - freeze or release the settle path. The two
 * directions are signed as distinct operations, so an "engage" credential cannot be
 * replayed as a "disengage". Prints the live halt state the server reports back.
 */
export async function killSwitchCmd(argv: string[], ctx: Context): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      rationale: { type: "string" },
      key: { type: "string" },
      "key-id": { type: "string" },
      pretty: { type: "boolean" },
    },
    allowPositionals: true,
  });

  const direction = positionals[0];
  if (direction !== "engage" && direction !== "disengage") {
    throw new CliError("usage: gl kill-switch <engage|disengage> --rationale <why>");
  }
  const rationale = requireRationale(values.rationale);

  const client = await operatorClientFrom(ctx, values);
  const state =
    direction === "engage"
      ? await client.engageKillSwitch(rationale)
      : await client.disengageKillSwitch(rationale);
  printJson(ctx, state, Boolean(values.pretty));
  return 0;
}
