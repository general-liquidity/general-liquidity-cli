import { describe, expect, test } from "bun:test";
import { run } from "../index.ts";
import { makeHarness } from "../internal/testkit.ts";

describe("gl audit", () => {
  test("GETs /audit with query params and prints camelCase events", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test", GL_API_KEY: "secret" },
      router: () => ({
        status: 200,
        json: [
          { type: "intent.settled", at: "2026-07-22T00:00:00Z", intent_key: "k1", payload: {} },
        ],
      }),
    });

    const code = await run(["audit", "--intent-key", "k1", "--limit", "5"], h.ctx);
    expect(code).toBe(0);

    const req = h.requests[0];
    expect(req?.method).toBe("GET");
    const url = new URL(req?.url as string);
    expect(url.pathname).toBe("/audit");
    expect(url.searchParams.get("intent_key")).toBe("k1");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(req?.headers.get("authorization")).toBe("Bearer secret");

    const events = JSON.parse(h.out[0] as string);
    expect(events[0].intentKey).toBe("k1");
  });

  test("refuses an out-of-range limit", async () => {
    const h = makeHarness({ env: { GL_BASE_URL: "https://gl.test" } });
    const code = await run(["audit", "--limit", "0"], h.ctx);
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("--limit");
  });
});
