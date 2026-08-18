import { parseArgs } from "node:util";
import { buildClient } from "../internal/client.ts";
import { resolveRuntime } from "../internal/config.ts";
import type { Context } from "../internal/context.ts";
import { CliError } from "../internal/errors.ts";
import { printJson } from "../internal/output.ts";
import { absentSigner } from "../internal/signer.ts";

/** The server's page-size ceiling, and the same silent clamp `gl audit` refuses rather than
 *  honours: a page that came back short with nothing saying so reads like the end of the list. */
const MAX_LIMIT = 100;

/** The lifecycle states the server filters on. `pending` is the only non-terminal one. */
const STATUSES = ["pending", "settled", "denied", "failed"] as const;

/**
 * gl intents [--status <s>] [--limit <n>] [--cursor <c>] - list this credential's intents,
 * newest first.
 *
 * A read, so it needs no signer. The recovery it exists for: a gate `confirm` parks an intent
 * and returns its id once, inside the approval.pending problem. An operator who lost that id
 * previously had to page the whole audit trail hunting for something they could not name, and
 * `--status pending` is that search done in one call.
 *
 * Prints the server's page envelope verbatim, as `gl audit` does, so a first page is never
 * mistaken for the complete list.
 */
export async function intentsCmd(argv: string[], ctx: Context): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      status: { type: "string" },
      limit: { type: "string" },
      cursor: { type: "string" },
      pretty: { type: "boolean" },
    },
    allowPositionals: false,
  });

  let status: (typeof STATUSES)[number] | undefined;
  if (typeof values.status === "string") {
    const candidate = values.status as (typeof STATUSES)[number];
    if (!STATUSES.includes(candidate)) {
      throw new CliError(`--status must be one of: ${STATUSES.join(" ")}`);
    }
    status = candidate;
  }

  let limit: number | undefined;
  if (typeof values.limit === "string") {
    limit = Number(values.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new CliError(
        `--limit must be an integer between 1 and ${MAX_LIMIT} (the server clamps to that ` +
          `range without saying so). Page the rest with --cursor <nextCursor>.`,
      );
    }
  }

  const cursor = typeof values.cursor === "string" ? values.cursor : undefined;
  if (cursor !== undefined && cursor.length === 0) {
    throw new CliError("--cursor must be a nextCursor value from a prior page");
  }

  const rt = resolveRuntime(ctx);
  const client = buildClient(ctx, rt, absentSigner);
  const page = await client.listIntents({ status, limit, cursor });
  printJson(ctx, page, Boolean(values.pretty));
  return 0;
}
