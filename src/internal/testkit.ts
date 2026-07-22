import type { Context, FetchLike } from "./context.ts";

// Test-only helpers: an in-memory Context so command handlers run with no real disk,
// env, network, or clock. Not shipped (excluded from package files).

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Headers;
  body?: unknown;
}

export interface Harness {
  ctx: Context;
  out: string[];
  err: string[];
  requests: RecordedRequest[];
  files: Map<string, string>;
}

export interface StubResponse {
  status?: number;
  json?: unknown;
}

/** A fetch stub driven by a router that maps (url, method) to a canned response. */
export function stubFetch(
  router: (req: RecordedRequest) => StubResponse,
  requests: RecordedRequest[],
): FetchLike {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    let body: unknown;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const req: RecordedRequest = { url, method, headers, body };
    requests.push(req);
    const { status = 200, json = {} } = router(req);
    return new Response(JSON.stringify(json), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
}

export interface HarnessOptions {
  env?: Record<string, string | undefined>;
  files?: Record<string, string>;
  router?: (req: RecordedRequest) => StubResponse;
  now?: Date;
}

export function makeHarness(opts: HarnessOptions = {}): Harness {
  const out: string[] = [];
  const err: string[] = [];
  const requests: RecordedRequest[] = [];
  const files = new Map<string, string>(Object.entries(opts.files ?? {}));
  const now = opts.now ?? new Date("2026-07-22T00:00:00.000Z");

  const ctx: Context = {
    env: opts.env ?? {},
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    fetchImpl: stubFetch(opts.router ?? (() => ({ status: 200, json: {} })), requests),
    now: () => now,
    readFile: (path) => files.get(path),
    writeFile: (path, data) => {
      files.set(path, data);
    },
    homeDir: () => "/home/test",
  };

  return { ctx, out, err, requests, files };
}

/** A deterministic 32-byte ed25519 seed for tests. */
export const TEST_SEED = `0x${"11".repeat(32)}`;
