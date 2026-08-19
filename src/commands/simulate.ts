import type { Context } from "../internal/context.ts";
import { printJson } from "../internal/output.ts";
import { prepareIntent } from "./pay.ts";

/**
 * gl simulate - what the gate WOULD decide for this intent, without doing any of it.
 *
 * Takes exactly the flags `gl pay` takes, and builds the same signed envelope, because a dry
 * run over a differently-constructed intent answers a question nobody asked.
 *
 * It settles nothing, writes no audit entry, and does not consume the idempotency key, so
 * simulating a payment never prevents making it. `gl mandate` shows the caps and nothing else:
 * a deny-list hit, a risk tier or a velocity refusal is invisible there until you are refused
 * by one, and finding out by paying costs a parked intent and someone's attention.
 *
 * The verdict is an answer, not a reservation. `authorizes` is always false, and an `allow`
 * can still be refused at submission if the cumulative state moved underneath it.
 */
export async function simulateCmd(argv: string[], ctx: Context): Promise<number> {
  const { intent, client, pretty } = await prepareIntent(argv, ctx);
  printJson(ctx, await client.simulate(intent), pretty);
  return 0;
}
