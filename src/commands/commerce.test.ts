import { describe, expect, test } from "bun:test";
import { run } from "../index.ts";
import { makeHarness } from "../internal/testkit.ts";

const CART = {
  id: "cart-1",
  protocol: "acp",
  status: "ready",
  currency: "USD",
  total: { value: "2400", asset: "USD" },
  merchant: "shop.example",
};

describe("gl quote", () => {
  test("posts the priced-cart request and prints the Cart", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => ({ status: 200, json: CART }),
    });

    const code = await run(
      [
        "quote",
        "--rail",
        "acp",
        "--merchant",
        "shop.example",
        "--currency",
        "USD",
        "--line",
        "sku-1:2",
        "--line",
        "sku-2:1",
      ],
      h.ctx,
    );
    expect(code).toBe(0);

    const req = h.requests[0];
    expect(req?.method).toBe("POST");
    expect(req?.url).toBe("https://gl.test/quote");
    expect(req?.body).toEqual({
      rail: "acp",
      merchant: "shop.example",
      currency: "USD",
      lines: [
        { id: "sku-1", quantity: 2 },
        { id: "sku-2", quantity: 1 },
      ],
    });
    // Commits nothing: no envelope, no terms, no idempotency key cross the boundary.
    expect(req?.body).not.toHaveProperty("envelope");
    expect(req?.body).not.toHaveProperty("terms");

    const parsed = JSON.parse(h.out[0] as string);
    expect(parsed.status).toBe("ready");
  });

  test("needs no signer key", async () => {
    // `quote` moves no money, so it must work with no GL_SIGNER_PRIVATE_KEY in the env.
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => ({ status: 200, json: CART }),
    });
    const code = await run(
      ["quote", "--rail", "ucp", "--merchant", "m", "--currency", "USD", "--line", "a:1"],
      h.ctx,
    );
    expect(code).toBe(0);
  });

  test("refuses a rail that is not a checkout protocol", async () => {
    const h = makeHarness({ env: { GL_BASE_URL: "https://gl.test" } });
    // x402 is a valid RailId but not a checkout protocol; refused here, never dispatched.
    const code = await run(
      ["quote", "--rail", "x402", "--merchant", "m", "--currency", "USD", "--line", "a:1"],
      h.ctx,
    );
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("--rail must be one of: acp, ucp");
    expect(h.requests).toHaveLength(0);
  });

  test("refuses a non-positive or fractional quantity before dispatch", async () => {
    for (const bad of ["sku-1:0", "sku-1:1.5", "sku-1:-2"]) {
      const h = makeHarness({ env: { GL_BASE_URL: "https://gl.test" } });
      const code = await run(
        ["quote", "--rail", "acp", "--merchant", "m", "--currency", "USD", "--line", bad],
        h.ctx,
      );
      expect(code).toBe(2);
      expect(h.err.join("\n")).toContain("positive integer");
      expect(h.requests).toHaveLength(0);
    }
  });

  test("refuses a line with no quantity separator", async () => {
    const h = makeHarness({ env: { GL_BASE_URL: "https://gl.test" } });
    const code = await run(
      ["quote", "--rail", "acp", "--merchant", "m", "--currency", "USD", "--line", "sku-1"],
      h.ctx,
    );
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("<itemId>:<quantity>");
  });

  test("splits on the LAST colon so an item id may contain one", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => ({ status: 200, json: CART }),
    });
    const code = await run(
      ["quote", "--rail", "acp", "--merchant", "m", "--currency", "USD", "--line", "urn:sku:1:3"],
      h.ctx,
    );
    expect(code).toBe(0);
    expect(h.requests[0]?.body).toMatchObject({ lines: [{ id: "urn:sku:1", quantity: 3 }] });
  });

  test("refuses with no lines", async () => {
    const h = makeHarness({ env: { GL_BASE_URL: "https://gl.test" } });
    const code = await run(
      ["quote", "--rail", "acp", "--merchant", "m", "--currency", "USD"],
      h.ctx,
    );
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("at least one --line");
  });
});
