import { parseArgs } from "node:util";
import { buildClient } from "../internal/client.ts";
import { resolveRuntime } from "../internal/config.ts";
import type { Context } from "../internal/context.ts";
import { CliError } from "../internal/errors.ts";
import { printJson } from "../internal/output.ts";
import { ed25519SignerFromSeed } from "../internal/signer.ts";

/** gl disclose - produce this operator's own signed disclosure (signed locally). */
export async function discloseCmd(argv: string[], ctx: Context): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { pretty: { type: "boolean" } },
    allowPositionals: false,
  });

  const rt = resolveRuntime(ctx);
  if (!rt.signerKey) {
    throw new CliError(`no signer key: set ${rt.signerKeyEnv} to sign the disclosure`);
  }
  const client = buildClient(ctx, rt, ed25519SignerFromSeed(rt.signerKey));
  const disclosure = await client.disclose();
  printJson(ctx, disclosure, Boolean(values.pretty));
  return 0;
}
