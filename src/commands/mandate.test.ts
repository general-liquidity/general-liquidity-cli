import { describe, expect, test } from "bun:test";
import { run } from "../index.ts";
import { makeHarness } from "../internal/testkit.ts";

const VIEW = {
  mandate: {
    id: "m1",
    payees: ["acme"],
    perTxCap: { value: "5000", asset: "USD" },
    perPeriodCap: { value: "20000", asset: "USD" },
    period: "P1D",
    expiresAt: "2026-12-31T00:00:00Z",
  },
  spent: { value: "7500", asset: "USD" },
  remaining: { value: "12500", asset: "USD" },
  periodResetAt: "2026-08-05T00:00:00Z",
};

describe("gl mandate", () => {
  test("GETs /mandate and prints the envelope verbatim", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => ({ status: 200, json: { data: [VIEW] } }),
    });

    const code = await run(["mandate"], h.ctx);
    expect(code).toBe(0);
    expect(h.requests[0]?.method).toBe("GET");
    expect(new URL(h.requests[0]!.url).pathname).toBe("/mandate");

    const body = JSON.parse(h.out[0] as string);
    expect(body.data[0].remaining).toEqual({ value: "12500", asset: "USD" });
    expect(body.data[0].mandate.id).toBe("m1");
  });

  test("needs no signer key", async () => {
    // A read that moves nothing and grants nothing must not require a signing seed.
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => ({ status: 200, json: { data: [] } }),
    });
    expect(await run(["mandate"], h.ctx)).toBe(0);
  });

  test("no live authority exits 0, not as an error", async () => {
    // "You may spend nothing" is exactly what this command exists to tell you.
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => ({ status: 200, json: { data: [] } }),
    });
    const code = await run(["mandate"], h.ctx);
    expect(code).toBe(0);
    expect(JSON.parse(h.out[0] as string)).toEqual({ data: [] });
  });

  test("an unknown budget stays absent rather than printing as zero", async () => {
    const unknown = { mandate: VIEW.mandate, periodResetAt: VIEW.periodResetAt };
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => ({ status: 200, json: { data: [unknown] } }),
    });
    await run(["mandate"], h.ctx);
    const printed = JSON.parse(h.out[0] as string);
    expect(printed.data[0]).not.toHaveProperty("spent");
    expect(printed.data[0]).not.toHaveProperty("remaining");
  });

  test("refuses with no server configured", async () => {
    const h = makeHarness({ env: {} });
    expect(await run(["mandate"], h.ctx)).toBe(2);
    expect(h.err.join("\n")).toContain("no server configured");
  });
});
