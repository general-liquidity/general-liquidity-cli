#!/usr/bin/env bun
import { auditCmd } from "./commands/audit.ts";
import { configCmd } from "./commands/config.ts";
import { discloseCmd } from "./commands/disclose.ts";
import { payCmd } from "./commands/pay.ts";
import { resolveCmd } from "./commands/resolve.ts";
import { testnetPayCmd } from "./commands/testnetPay.ts";
import { verifyCmd } from "./commands/verify.ts";
import { type Context, defaultContext } from "./internal/context.ts";
import { CliError } from "./internal/errors.ts";
import { isGlError, printProblem } from "./internal/output.ts";

type Handler = (argv: string[], ctx: Context) => Promise<number>;

const COMMANDS: Record<string, Handler> = {
  resolve: resolveCmd,
  verify: verifyCmd,
  disclose: discloseCmd,
  pay: payCmd,
  audit: auditCmd,
  "testnet-pay": testnetPayCmd,
  config: configCmd,
};

const HELP = `gl - operator CLI for General Liquidity

Usage: gl <command> [options]

Commands:
  resolve <ref>                 Normalize a counterparty reference into a Counterparty
  verify <disclosure.json>      Check a counterparty disclosure against policy (Decision)
  disclose                      Print this operator's own signed disclosure
  pay                           Submit a governed pay intent, print the Receipt or problem
  audit [--intent-key <k>]      Read the signed audit trail ([--limit <n>])
  testnet-pay                   Governed live Base Sepolia settlement (env-driven)
  config <show|path|get|set>    Inspect or edit the non-secret CLI config

Global:
  --pretty                      Indent JSON output

Environment:
  GL_BASE_URL                   Base URL of the running GL server
  GL_API_KEY                    Server API key (env var name is configurable)
  GL_SIGNER_PRIVATE_KEY         Operator ed25519 signing seed, hex (name is configurable)

Keys are read from the environment only; never hardcoded, never committed.`;

/** Map a thrown value to an exit code, printing to the right stream. */
function reportError(err: unknown, ctx: Context): number {
  if (err instanceof CliError) {
    ctx.err(err.message);
    return err.code;
  }
  if (isGlError(err)) {
    printProblem(ctx, err, false);
    return 1;
  }
  const problem = (err as { problem?: unknown })?.problem;
  if (problem && typeof problem === "object") {
    ctx.err(JSON.stringify(problem));
    return 1;
  }
  ctx.err(err instanceof Error ? err.message : String(err));
  return 1;
}

export async function run(argv: string[], ctx: Context): Promise<number> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    ctx.out(HELP);
    return cmd ? 0 : 1;
  }
  const handler = COMMANDS[cmd];
  if (!handler) {
    ctx.err(`unknown command: ${cmd}\n\n${HELP}`);
    return 2;
  }
  try {
    return await handler(rest, ctx);
  } catch (err) {
    return reportError(err, ctx);
  }
}

if (import.meta.main) {
  run(process.argv.slice(2), defaultContext()).then((code) => process.exit(code));
}
