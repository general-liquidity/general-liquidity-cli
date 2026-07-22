import { join } from "node:path";
import type { Context } from "./context.ts";
import { CliError } from "./errors.ts";

/** The persisted, non-secret CLI configuration. Secrets are NEVER stored here. */
export interface CliConfig {
  /** Base URL of the running GL server (the trust boundary that holds the settler). */
  baseUrl?: string;
  /** Name of the env var that holds the server API key. Default GL_API_KEY. */
  apiKeyEnv?: string;
  /** Name of the env var that holds the operator signing key. Default GL_SIGNER_PRIVATE_KEY. */
  signerKeyEnv?: string;
  /** How the API key is presented to the server. */
  authScheme?: "bearer" | "x-api-key";
}

/** The fully resolved runtime: config file merged with env, secrets read from env. */
export interface Runtime {
  baseUrl: string;
  apiKey?: string;
  authScheme: "bearer" | "x-api-key";
  apiKeyEnv: string;
  signerKeyEnv: string;
  signerKey?: string;
  configPath: string;
  fileConfig: CliConfig;
}

const DEFAULT_API_KEY_ENV = "GL_API_KEY";
const DEFAULT_SIGNER_KEY_ENV = "GL_SIGNER_PRIVATE_KEY";
const DEFAULT_AUTH_SCHEME = "bearer" as const;

/** Where the config file lives. GL_CONFIG overrides the default XDG-style path. */
export function configPathFor(ctx: Context): string {
  const override = ctx.env["GL_CONFIG"]?.trim();
  if (override) return override;
  return join(ctx.homeDir(), ".config", "general-liquidity", "config.json");
}

export function loadFileConfig(ctx: Context, path: string): CliConfig {
  const raw = ctx.readFile(path);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as CliConfig;
    throw new Error("not an object");
  } catch (cause) {
    throw new CliError(
      `config file at ${path} is not valid JSON: ${cause instanceof Error ? cause.message : cause}`,
    );
  }
}

/**
 * Resolve the effective runtime. Precedence: explicit env (GL_BASE_URL, the configured
 * key env vars) wins over the config file. Secret values are read from the environment
 * only; the config file supplies their env-var NAMES, never the secrets themselves.
 */
export function resolveRuntime(ctx: Context): Runtime {
  const configPath = configPathFor(ctx);
  const fileConfig = loadFileConfig(ctx, configPath);

  const apiKeyEnv = fileConfig.apiKeyEnv ?? DEFAULT_API_KEY_ENV;
  const signerKeyEnv = fileConfig.signerKeyEnv ?? DEFAULT_SIGNER_KEY_ENV;
  const authScheme = fileConfig.authScheme ?? DEFAULT_AUTH_SCHEME;

  const baseUrl = ctx.env["GL_BASE_URL"]?.trim() || fileConfig.baseUrl?.trim() || "";
  const apiKey = ctx.env[apiKeyEnv]?.trim() || undefined;
  const signerKey = ctx.env[signerKeyEnv]?.trim() || undefined;

  return {
    baseUrl,
    apiKey,
    authScheme,
    apiKeyEnv,
    signerKeyEnv,
    signerKey,
    configPath,
    fileConfig,
  };
}

/** The base URL is required to reach the server; refuse cleanly when it is unset. */
export function requireBaseUrl(rt: Runtime): string {
  if (!rt.baseUrl) {
    throw new CliError(
      "no server configured: set GL_BASE_URL or run `gl config set base-url <url>`",
    );
  }
  return rt.baseUrl;
}
