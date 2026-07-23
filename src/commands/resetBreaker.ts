import { parseArgs } from "node:util";
import type { Context } from "../internal/context.ts";
import { operatorClientFrom, requireRationale } from "../internal/operator.ts";
import { printJson } from "../internal/output.ts";

/**
 * gl reset-breaker - clear a tripped circuit breaker over the operator channel. Prints
 * the live halt state the server reports back.
 */
export async function resetBreakerCmd(argv: string[], ctx: Context): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      rationale: { type: "string" },
      key: { type: "string" },
      "key-id": { type: "string" },
      pretty: { type: "boolean" },
    },
    allowPositionals: false,
  });

  const rationale = requireRationale(values.rationale);
  const client = await operatorClientFrom(ctx, values);
  const state = await client.resetCircuitBreaker(rationale);
  printJson(ctx, state, Boolean(values.pretty));
  return 0;
}
