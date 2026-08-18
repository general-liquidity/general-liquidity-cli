import { parseArgs } from "node:util";
import { buildClient } from "../internal/client.ts";
import { resolveRuntime } from "../internal/config.ts";
import type { Context } from "../internal/context.ts";
import { printJson } from "../internal/output.ts";
import { absentSigner } from "../internal/signer.ts";

/**
 * gl mandate - print the spend authority covering this credential, and what is left of it.
 *
 * A read, so it needs no signer: it moves nothing and grants nothing. It prints the server's
 * envelope verbatim for the same reason `gl audit` does — this is evidence about what an
 * operator granted, and a rendering of evidence is not evidence.
 *
 * `spent` and `remaining` are ABSENT together when the server holds a prior spend in a currency
 * it has no rate for, which is the same state in which the gate refuses to authorize at all.
 * Absent means unknown, never zero.
 *
 * An empty `data` array means this credential holds no live authority. That is an answer, not
 * an error, and the exit code stays 0.
 */
export async function mandateCmd(argv: string[], ctx: Context): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { pretty: { type: "boolean" } },
    allowPositionals: false,
  });

  const rt = resolveRuntime(ctx);
  const client = buildClient(ctx, rt, absentSigner);
  const views = await client.getMandate();
  printJson(ctx, { data: views }, Boolean(values.pretty));
  return 0;
}
