import { parseArgs } from "node:util";
import { fetchAudit } from "../internal/audit.ts";
import { resolveRuntime } from "../internal/config.ts";
import type { Context } from "../internal/context.ts";
import { CliError } from "../internal/errors.ts";
import { printJson } from "../internal/output.ts";

/** The server's page-size ceiling, from the spec `Limit` parameter: "clamped to [1, 100]".
 *  The clamp is SILENT, so a larger `--limit` came back short with nothing saying so. On an
 *  audit log a short page is indistinguishable from the end of the evidence, so this refuses
 *  the request instead of letting the caller believe it was honoured. */
const MAX_LIMIT = 100;

/** gl audit [--intent-key <k>] [--limit <n>] [--cursor <c>] - read the signed audit trail.
 *
 *  Prints the server's `Page` envelope verbatim (`data`, `has_more`, `next_cursor`) rather
 *  than unwrapping `data`: a caller that reads the output cannot otherwise tell a complete
 *  trail from the first page of one, which on an audit log is the difference between
 *  evidence and a sample. `--cursor` takes a prior page's `next_cursor`, which is what makes
 *  the rest of the chain reachable at all. */
export async function auditCmd(argv: string[], ctx: Context): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      "intent-key": { type: "string" },
      limit: { type: "string" },
      cursor: { type: "string" },
      pretty: { type: "boolean" },
    },
    allowPositionals: false,
  });

  let limit: number | undefined;
  if (typeof values.limit === "string") {
    limit = Number(values.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new CliError(
        `--limit must be an integer between 1 and ${MAX_LIMIT} (the server clamps to that ` +
          `range without saying so, so a larger page size would return fewer rows than asked ` +
          `for). Page the rest with --cursor <next_cursor>.`,
      );
    }
  }

  const cursor = typeof values.cursor === "string" ? values.cursor : undefined;
  if (cursor !== undefined && cursor.length === 0) {
    throw new CliError("--cursor must be a next_cursor value from a prior page");
  }

  const rt = resolveRuntime(ctx);
  const page = await fetchAudit(ctx, rt, {
    intentKey: typeof values["intent-key"] === "string" ? values["intent-key"] : undefined,
    limit,
    cursor,
  });
  printJson(ctx, page, Boolean(values.pretty));
  return 0;
}
