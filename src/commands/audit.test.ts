import { describe, expect, test } from "bun:test";
import { run } from "../index.ts";
import { makeHarness } from "../internal/testkit.ts";

describe("gl audit", () => {
  const page = (intentKey: string) => ({
    status: 200,
    json: {
      data: [{ type: "intent.settled", at: "2026-07-22T00:00:00Z", intentKey, payload: {} }],
      hasMore: false,
      nextCursor: null,
    },
  });

  test("GETs /audit and prints the page envelope, not a bare array", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test", GL_API_KEY: "secret" },
      router: () => page("k1"),
    });

    const code = await run(["audit", "--limit", "5"], h.ctx);
    expect(code).toBe(0);

    const req = h.requests[0];
    expect(req?.method).toBe("GET");
    const url = new URL(req?.url as string);
    expect(url.pathname).toBe("/audit");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(req?.headers.get("authorization")).toBe("Bearer secret");

    const body = JSON.parse(h.out[0] as string);
    expect(Array.isArray(body)).toBe(false);
    expect(body.data[0].intentKey).toBe("k1");
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
  });

  // The regression this pins: `--intent-key` used to send an `intent_key` QUERY param, which
  // /audit declares no parameter for and therefore ignored, so the user got the whole chain
  // back and had no way to see that the filter had not been applied.
  test("--intent-key asks the per-intent route, never an ignored query param", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => page("k1"),
    });

    const code = await run(["audit", "--intent-key", "k 1", "--limit", "5"], h.ctx);
    expect(code).toBe(0);

    const url = new URL(h.requests[0]?.url as string);
    expect(url.pathname).toBe("/intents/k%201/events");
    expect(url.searchParams.get("intent_key")).toBeNull();
    expect(url.searchParams.get("limit")).toBe("5");
  });

  test("refuses an out-of-range limit", async () => {
    const h = makeHarness({ env: { GL_BASE_URL: "https://gl.test" } });
    const code = await run(["audit", "--limit", "0"], h.ctx);
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("--limit");
  });

  // The regression this pins: `--limit` accepted up to 1000 while the spec bounds the server's
  // `limit` at 100 and the server clamps SILENTLY, so `--limit 500` returned 100 rows and read
  // like the end of the trail. The user has to be told, not handed a short page.
  test("refuses a limit above the server's ceiling instead of being silently clamped", async () => {
    const h = makeHarness({ env: { GL_BASE_URL: "https://gl.test" } });
    const code = await run(["audit", "--limit", "500"], h.ctx);
    expect(code).toBe(2);
    expect(h.requests.length).toBe(0);
    const err = h.err.join("\n");
    expect(err).toContain("between 1 and 100");
    expect(err).toContain("--cursor");
  });

  test("accepts the ceiling itself", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => page("k1"),
    });
    expect(await run(["audit", "--limit", "100"], h.ctx)).toBe(0);
    expect(new URL(h.requests[0]?.url as string).searchParams.get("limit")).toBe("100");
  });

  // Without --cursor there was no way to read past the first page at all, even though the
  // envelope has always carried the token needed to continue.
  test("--cursor forwards a prior page's nextCursor", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => page("k2"),
    });

    const code = await run(["audit", "--limit", "5", "--cursor", "seq:42"], h.ctx);
    expect(code).toBe(0);

    const url = new URL(h.requests[0]?.url as string);
    expect(url.pathname).toBe("/audit");
    expect(url.searchParams.get("cursor")).toBe("seq:42");
  });

  test("--cursor pages the per-intent slice too", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => page("k1"),
    });

    expect(await run(["audit", "--intent-key", "k1", "--cursor", "seq:7"], h.ctx)).toBe(0);
    const url = new URL(h.requests[0]?.url as string);
    expect(url.pathname).toBe("/intents/k1/events");
    expect(url.searchParams.get("cursor")).toBe("seq:7");
  });

  test("refuses an empty --cursor rather than silently rereading page one", async () => {
    const h = makeHarness({ env: { GL_BASE_URL: "https://gl.test" } });
    expect(await run(["audit", "--cursor", ""], h.ctx)).toBe(2);
    expect(h.requests.length).toBe(0);
    expect(h.err.join("\n")).toContain("--cursor");
  });
});
