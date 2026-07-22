import { parseArgs } from "node:util";
import { fetchAudit } from "../internal/audit.ts";
import { resolveRuntime } from "../internal/config.ts";
import type { Context } from "../internal/context.ts";
import { CliError } from "../internal/errors.ts";
import { printJson } from "../internal/output.ts";

/** gl audit [--intent-key <k>] [--limit <n>] - read the signed audit trail. */
export async function auditCmd(argv: string[], ctx: Context): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      "intent-key": { type: "string" },
      limit: { type: "string" },
      pretty: { type: "boolean" },
    },
    allowPositionals: false,
  });

  let limit: number | undefined;
  if (typeof values.limit === "string") {
    limit = Number(values.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new CliError("--limit must be an integer between 1 and 1000");
    }
  }

  const rt = resolveRuntime(ctx);
  const events = await fetchAudit(ctx, rt, {
    intentKey: typeof values["intent-key"] === "string" ? values["intent-key"] : undefined,
    limit,
  });
  printJson(ctx, events, Boolean(values.pretty));
  return 0;
}
