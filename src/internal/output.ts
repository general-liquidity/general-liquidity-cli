import { GlError, type Problem } from "@general-liquidity/sdk";
import type { Context } from "./context.ts";

/** Machine-friendly by default: single-line JSON to stdout, indented with --pretty. */
export function printJson(ctx: Context, value: unknown, pretty: boolean): void {
  ctx.out(JSON.stringify(value, null, pretty ? 2 : 0));
}

/**
 * Print a server failure as its RFC 7807 problem+json to stderr. The GlError carries the
 * original problem body when the server sent one; otherwise a minimal problem is
 * synthesized from the typed error so the shape is always the same.
 */
export function printProblem(ctx: Context, err: GlError, pretty: boolean): void {
  const problem: Problem = err.problem ?? {
    type: err.type,
    title: err.message,
    status: err.status,
    detail: err.detail,
    instance: err.instance,
  };
  ctx.err(JSON.stringify(problem, null, pretty ? 2 : 0));
}

/** Whether a thrown value is a server-side GL problem (vs a local CLI refusal). */
export function isGlError(err: unknown): err is GlError {
  return err instanceof GlError;
}
