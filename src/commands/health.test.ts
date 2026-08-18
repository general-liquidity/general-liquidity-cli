import { describe, expect, test } from "bun:test";
import { run } from "../index.ts";
import { makeHarness } from "../internal/testkit.ts";

describe("gl health", () => {
  test("GETs /health and prints status and version", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => ({ status: 200, json: { status: "ok", version: "2026-07-22" } }),
    });

    const code = await run(["health"], h.ctx);
    expect(code).toBe(0);
    expect(new URL(h.requests[0]!.url).pathname).toBe("/health");
    expect(JSON.parse(h.out[0] as string)).toEqual({ status: "ok", version: "2026-07-22" });
  });

  test("works with only a base URL, no API key and no signer configured", async () => {
    // The whole point of the command: it must answer when no credential is configured at all,
    // because that is one of the cases it exists to diagnose. A key that IS configured still
    // rides along, since authedFetch attaches it to every request; the server ignores it here.
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => ({ status: 200, json: { status: "ok", version: null } }),
    });

    expect(await run(["health"], h.ctx)).toBe(0);
    const headers = new Headers(h.requests[0]!.headers);
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("x-api-key")).toBeNull();
  });

  test("a deployment with no configured version reports null", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => ({ status: 200, json: { status: "ok", version: null } }),
    });

    expect(await run(["health"], h.ctx)).toBe(0);
    expect(JSON.parse(h.out[0] as string).version).toBeNull();
  });

  test("an unreachable server is a non-zero exit, not a false 'ok'", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => {
        throw new Error("connection refused");
      },
    });
    expect(await run(["health"], h.ctx)).not.toBe(0);
  });
});
