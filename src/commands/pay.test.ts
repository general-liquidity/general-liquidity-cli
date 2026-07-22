import { describe, expect, test } from "bun:test";
import { run } from "../index.ts";
import { makeHarness, TEST_SEED } from "../internal/testkit.ts";

const FULL_FLAGS = [
  "pay",
  "--payee",
  "0xF00",
  "--amount",
  "1000",
  "--asset",
  "USDC",
  "--purpose",
  "api credits",
  "--rail",
  "x402",
  "--reversibility",
  "irreversible",
  "--finality",
  "instant",
  "--credential",
  "eip3009",
  "--capital-source",
  "payer",
  "--presence",
  "delegated",
  "--mandate",
  "m1",
];

describe("gl pay", () => {
  test("signs the envelope and submits a snake_case Intent", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test", GL_SIGNER_PRIVATE_KEY: TEST_SEED },
      router: () => ({
        status: 200,
        json: {
          intent_key: "k1",
          rail: "x402",
          reference: "0xabc",
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
      }),
    });

    const code = await run(FULL_FLAGS, h.ctx);
    expect(code).toBe(0);

    const req = h.requests[0];
    expect(req?.url).toBe("https://gl.test/pay");
    expect(req?.headers.get("idempotency-key")).toBeTruthy();

    const body = req?.body as {
      payee: string;
      terms: { capital_source: string };
      envelope: { signature: string; grant: { signature: string } };
    };
    expect(body.payee).toBe("0xF00");
    expect(body.terms.capital_source).toBe("payer");
    expect(body.envelope.signature.length).toBeGreaterThan(0);
    expect(body.envelope.grant.signature.length).toBeGreaterThan(0);

    const receipt = JSON.parse(h.out[0] as string);
    expect(receipt.intentKey).toBe("k1");
    expect(receipt.terms.capitalSource).toBe("payer");
  });

  test("prints the RFC 7807 problem on deny", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test", GL_SIGNER_PRIVATE_KEY: TEST_SEED },
      router: () => ({
        status: 403,
        json: {
          type: "https://gl/problems/over-mandate",
          title: "over mandate",
          status: 403,
          code: "over_mandate",
        },
      }),
    });

    const code = await run(FULL_FLAGS, h.ctx);
    expect(code).toBe(1);
    const problem = JSON.parse(h.err[0] as string);
    expect(problem.code).toBe("over_mandate");
    expect(problem.status).toBe(403);
  });

  test("refuses without a signer key", async () => {
    const h = makeHarness({ env: { GL_BASE_URL: "https://gl.test" } });
    const code = await run(FULL_FLAGS, h.ctx);
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("no signer key");
  });

  test("refuses a missing required flag", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test", GL_SIGNER_PRIVATE_KEY: TEST_SEED },
    });
    const code = await run(["pay", "--amount", "1"], h.ctx);
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("--payee");
  });

  test("refuses an invalid rail", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test", GL_SIGNER_PRIVATE_KEY: TEST_SEED },
    });
    const flags = FULL_FLAGS.map((f) => (f === "x402" ? "paypal" : f));
    const code = await run(flags, h.ctx);
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("--rail must be one of");
  });
});
