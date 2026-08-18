import { describe, expect, test } from "bun:test";
import { run } from "../index.ts";
import { makeHarness } from "../internal/testkit.ts";

const job = (id: string, status: string) => ({
  id,
  status,
  createdAt: "2026-08-01T00:00:00Z",
  outcome: status === "settled" ? "allow" : "confirm",
  links: { self: `/intents/${id}`, events: `/intents/${id}/events` },
});

const page = { data: [job("k2", "pending"), job("k1", "settled")], hasMore: false };

describe("gl intents", () => {
  test("GETs /intents and prints the page envelope verbatim", async () => {
    // The envelope, not just `data`: a caller reading the output cannot otherwise tell a
    // first page from the complete list.
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => ({ status: 200, json: page }),
    });

    const code = await run(["intents"], h.ctx);
    expect(code).toBe(0);
    expect(h.requests[0]?.method).toBe("GET");
    expect(new URL(h.requests[0]!.url).pathname).toBe("/intents");

    const body = JSON.parse(h.out[0] as string);
    expect(body.data.map((j: { id: string }) => j.id)).toEqual(["k2", "k1"]);
    expect(body.hasMore).toBe(false);
  });

  test("needs no signer key", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => ({ status: 200, json: { data: [], hasMore: false } }),
    });
    expect(await run(["intents"], h.ctx)).toBe(0);
  });

  test("--status rides the query string", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => ({ status: 200, json: { data: [], hasMore: false } }),
    });

    expect(await run(["intents", "--status", "pending"], h.ctx)).toBe(0);
    expect(new URL(h.requests[0]!.url).searchParams.get("status")).toBe("pending");
  });

  test("an unknown --status is refused here rather than sent", async () => {
    // The server would answer 400, which costs a round trip to learn a closed vocabulary.
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => ({ status: 200, json: { data: [], hasMore: false } }),
    });

    expect(await run(["intents", "--status", "parked"], h.ctx)).not.toBe(0);
    expect(h.requests).toHaveLength(0);
    expect(h.err.join(" ")).toContain("pending");
  });

  test("a --limit above the server ceiling is refused, not silently clamped", async () => {
    // Same reason as `gl audit`: a clamped page comes back short with nothing saying so, and
    // a short page of intents reads like having fewer intents than you have.
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => ({ status: 200, json: { data: [], hasMore: false } }),
    });

    expect(await run(["intents", "--limit", "500"], h.ctx)).not.toBe(0);
    expect(h.requests).toHaveLength(0);
  });

  test("--cursor pages on from a prior nextCursor", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => ({ status: 200, json: { data: [], hasMore: false } }),
    });

    expect(await run(["intents", "--cursor", "c0", "--limit", "10"], h.ctx)).toBe(0);
    const url = new URL(h.requests[0]!.url);
    expect(url.searchParams.get("cursor")).toBe("c0");
    expect(url.searchParams.get("limit")).toBe("10");
  });

  test("no intents exits 0", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => ({ status: 200, json: { data: [], hasMore: false } }),
    });
    expect(await run(["intents"], h.ctx)).toBe(0);
  });
});
