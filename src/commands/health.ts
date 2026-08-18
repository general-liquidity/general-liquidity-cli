import { parseArgs } from "node:util";
import { buildClient } from "../internal/client.ts";
import { resolveRuntime } from "../internal/config.ts";
import type { Context } from "../internal/context.ts";
import { printJson } from "../internal/output.ts";
import { absentSigner } from "../internal/signer.ts";

/**
 * gl health - is the configured deployment up, and which API version does it stamp.
 *
 * The one command that works with nothing but a base URL: `/health` is served before auth, so
 * no API key and no signer are needed. That is what makes it useful for diagnosis. A failing
 * `gl pay` cannot by itself distinguish a deployment that is down from one that refused the
 * credential, and those have different fixes.
 *
 * It reports no capability roster, so it cannot answer which optional tiers a deployment
 * mounted. Call the route and read the `not_found`.
 */
export async function healthCmd(argv: string[], ctx: Context): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { pretty: { type: "boolean" } },
    allowPositionals: false,
  });

  const rt = resolveRuntime(ctx);
  const client = buildClient(ctx, rt, absentSigner);
  printJson(ctx, await client.health(), Boolean(values.pretty));
  return 0;
}
