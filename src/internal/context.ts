import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";

/** The injected HTTP seam. Matches the SDK's fetch shape so it can be handed to createClient. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * Everything a command touches that is not pure logic: the environment, IO sinks, the
 * network, the clock, and the config file. Tests supply an in-memory Context; nothing
 * reaches a real disk, env, or socket unless the default Context is used.
 */
export interface Context {
  env: Record<string, string | undefined>;
  out: (line: string) => void;
  err: (line: string) => void;
  fetchImpl: FetchLike;
  now: () => Date;
  readFile: (path: string) => string | undefined;
  writeFile: (path: string, data: string) => void;
  homeDir: () => string;
}

/** The production Context: real process env, stdio, fetch, clock, and filesystem. */
export function defaultContext(): Context {
  return {
    env: process.env,
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
    fetchImpl: (input, init) => globalThis.fetch(input, init),
    now: () => new Date(),
    readFile: (path) => (existsSync(path) ? readFileSync(path, "utf8") : undefined),
    writeFile: (path, data) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, data, "utf8");
    },
    homeDir: () => homedir(),
  };
}
