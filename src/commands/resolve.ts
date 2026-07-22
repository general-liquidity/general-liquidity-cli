import { parseArgs } from "node:util";
import { buildClient } from "../internal/client.ts";
import { resolveRuntime } from "../internal/config.ts";
import type { Context } from "../internal/context.ts";
import { CliError } from "../internal/errors.ts";
import { printJson } from "../internal/output.ts";
import { absentSigner } from "../internal/signer.ts";

/** gl resolve <ref> - normalize a counterparty reference into one Counterparty. */
export async function resolveCmd(argv: string[], ctx: Context): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { pretty: { type: "boolean" } },
    allowPositionals: true,
  });
  const ref = positionals[0];
  if (!ref) throw new CliError("usage: gl resolve <ref>");

  const rt = resolveRuntime(ctx);
  const client = buildClient(ctx, rt, absentSigner);
  const counterparty = await client.resolve(ref);
  printJson(ctx, counterparty, Boolean(values.pretty));
  return 0;
}
