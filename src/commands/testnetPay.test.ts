import { describe, expect, test } from "bun:test";
import { run } from "../index.ts";
import { makeHarness, TEST_SEED } from "../internal/testkit.ts";

const PAY_TO = "0x1111111111111111111111111111111111111111";

const RECEIPT = {
  status: 200,
  json: {
    intent_key: "testnet-x",
    rail: "x402",
    reference: "0xdeadbeef",
    terms: {
      reversibility: "irreversible",
      finality: "instant",
      credential: "eip3009",
      rail: "x402",
      capital_source: "payer",
      presence: "delegated",
    },
    settled_at: "2026-07-22T00:00:00Z",
    enforcement: "hash",
  },
};

describe("gl testnet-pay", () => {
  test("refuses when required env is missing", async () => {
    const h = makeHarness({ env: { GL_BASE_URL: "https://gl.test" } });
    const code = await run(["testnet-pay"], h.ctx);
    expect(code).toBe(2);
    const msg = h.err.join("\n");
    expect(msg).toContain("GL_FACILITATOR_URL");
    expect(msg).toContain("GL_PAY_TO");
    expect(h.requests.length).toBe(0);
  });

  test("refuses mainnet without GL_ALLOW_MAINNET", async () => {
    const h = makeHarness({
      env: {
        GL_BASE_URL: "https://gl.test",
        GL_SIGNER_PRIVATE_KEY: TEST_SEED,
        GL_FACILITATOR_URL: "https://x402.example",
        GL_PAY_TO: PAY_TO,
        GL_NETWORK: "base",
      },
    });
    const code = await run(["testnet-pay"], h.ctx);
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("NOT a testnet");
    expect(h.requests.length).toBe(0);
  });

  test("submits a governed on-chain Intent on Base Sepolia", async () => {
    const h = makeHarness({
      env: {
        GL_BASE_URL: "https://gl.test",
        GL_SIGNER_PRIVATE_KEY: TEST_SEED,
        GL_FACILITATOR_URL: "https://x402.example",
        GL_PAY_TO: PAY_TO,
      },
      router: () => RECEIPT,
    });
    const code = await run(["testnet-pay"], h.ctx);
    expect(code).toBe(0);

    const req = h.requests[0];
    expect(req?.url).toBe("https://gl.test/pay");
    const body = req?.body as {
      payee: string;
      amount: { value: string; asset: string };
      terms: { rail: string };
      envelope: { signature: string };
    };
    expect(body.payee).toBe(PAY_TO);
    expect(body.amount).toEqual({ value: "1000", asset: "USDC" });
    expect(body.terms.rail).toBe("x402");
    expect(body.envelope.signature.length).toBeGreaterThan(0);

    const receipt = JSON.parse(h.out[0] as string);
    expect(receipt.reference).toBe("0xdeadbeef");
  });

  test("allows mainnet with GL_ALLOW_MAINNET=1", async () => {
    const h = makeHarness({
      env: {
        GL_BASE_URL: "https://gl.test",
        GL_SIGNER_PRIVATE_KEY: TEST_SEED,
        GL_FACILITATOR_URL: "https://x402.example",
        GL_PAY_TO: PAY_TO,
        GL_NETWORK: "base",
        GL_ALLOW_MAINNET: "1",
      },
      router: () => RECEIPT,
    });
    const code = await run(["testnet-pay"], h.ctx);
    expect(code).toBe(0);
    expect(h.requests[0]?.url).toBe("https://gl.test/pay");
  });
});
