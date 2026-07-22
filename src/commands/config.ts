import { parseArgs } from "node:util";
import type { CliConfig } from "../internal/config.ts";
import { configPathFor, loadFileConfig, resolveRuntime } from "../internal/config.ts";
import type { Context } from "../internal/context.ts";
import { CliError } from "../internal/errors.ts";
import { printJson } from "../internal/output.ts";
import { ed25519SignerFromSeed } from "../internal/signer.ts";

// The config file holds only non-secret settings: the server base URL, which env vars
// carry the API key and the operator signing key, and the auth scheme. Secrets are read
// from those env vars at runtime and are never written here or printed.

const SETTABLE = ["base-url", "api-key-env", "signer-key-env", "auth-scheme"] as const;

function applySet(file: CliConfig, key: string, value: string): CliConfig {
  switch (key) {
    case "base-url":
      return { ...file, baseUrl: value };
    case "api-key-env":
      return { ...file, apiKeyEnv: value };
    case "signer-key-env":
      return { ...file, signerKeyEnv: value };
    case "auth-scheme":
      if (value !== "bearer" && value !== "x-api-key") {
        throw new CliError("auth-scheme must be `bearer` or `x-api-key`");
      }
      return { ...file, authScheme: value };
    default:
      throw new CliError(`unknown config key: ${key} (settable: ${SETTABLE.join(", ")})`);
  }
}

/** gl config <show|path|set|get> - inspect or edit the non-secret CLI config. */
export async function configCmd(argv: string[], ctx: Context): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { pretty: { type: "boolean" } },
    allowPositionals: true,
  });
  const sub = positionals[0] ?? "show";
  const pretty = Boolean(values.pretty);

  if (sub === "path") {
    ctx.out(configPathFor(ctx));
    return 0;
  }

  if (sub === "show") {
    const rt = resolveRuntime(ctx);
    const view: Record<string, unknown> = {
      configPath: rt.configPath,
      baseUrl: rt.baseUrl || null,
      authScheme: rt.authScheme,
      apiKeyEnv: rt.apiKeyEnv,
      apiKeyPresent: Boolean(rt.apiKey),
      signerKeyEnv: rt.signerKeyEnv,
      signerKeyPresent: Boolean(rt.signerKey),
    };
    if (rt.signerKey) {
      try {
        view.agentId = ed25519SignerFromSeed(rt.signerKey).agentId;
      } catch {
        view.agentId = null;
      }
    }
    printJson(ctx, view, pretty);
    return 0;
  }

  if (sub === "get") {
    const key = positionals[1];
    if (!key) throw new CliError(`usage: gl config get <${SETTABLE.join("|")}>`);
    const path = configPathFor(ctx);
    const file = loadFileConfig(ctx, path);
    const map: Record<string, unknown> = {
      "base-url": file.baseUrl ?? null,
      "api-key-env": file.apiKeyEnv ?? null,
      "signer-key-env": file.signerKeyEnv ?? null,
      "auth-scheme": file.authScheme ?? null,
    };
    if (!(key in map)) throw new CliError(`unknown config key: ${key}`);
    ctx.out(String(map[key] ?? ""));
    return 0;
  }

  if (sub === "set") {
    const key = positionals[1];
    const value = positionals[2];
    if (!key || value === undefined) {
      throw new CliError(`usage: gl config set <${SETTABLE.join("|")}> <value>`);
    }
    const path = configPathFor(ctx);
    const next = applySet(loadFileConfig(ctx, path), key, value);
    ctx.writeFile(path, `${JSON.stringify(next, null, 2)}\n`);
    ctx.out(`wrote ${path}`);
    return 0;
  }

  throw new CliError(`unknown config subcommand: ${sub} (use show | path | get | set)`);
}
