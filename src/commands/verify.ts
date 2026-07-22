import { parseArgs } from "node:util";
import type { Disclosure } from "@general-liquidity/sdk";
import { buildClient } from "../internal/client.ts";
import { resolveRuntime } from "../internal/config.ts";
import type { Context } from "../internal/context.ts";
import { CliError } from "../internal/errors.ts";
import { printJson } from "../internal/output.ts";
import { absentSigner } from "../internal/signer.ts";

/** gl verify <disclosure.json> - check a counterparty disclosure against policy. */
export async function verifyCmd(argv: string[], ctx: Context): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { pretty: { type: "boolean" } },
    allowPositionals: true,
  });
  const path = positionals[0];
  if (!path) throw new CliError("usage: gl verify <disclosure.json>");

  const raw = ctx.readFile(path);
  if (raw === undefined) throw new CliError(`disclosure file not found: ${path}`);

  let disclosure: Disclosure;
  try {
    disclosure = JSON.parse(raw) as Disclosure;
  } catch (cause) {
    throw new CliError(
      `disclosure file is not valid JSON: ${cause instanceof Error ? cause.message : cause}`,
    );
  }

  const rt = resolveRuntime(ctx);
  const client = buildClient(ctx, rt, absentSigner);
  const decision = await client.verify(disclosure);
  printJson(ctx, decision, Boolean(values.pretty));
  return 0;
}
