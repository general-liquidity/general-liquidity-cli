import { describe, expect, test } from "bun:test";
import { run } from "../index.ts";
import { makeHarness } from "../internal/testkit.ts";

const KEY = "0x" + "11".repeat(32);
const flags = [
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
  "m_ops",
];

describe("gl simulate", () => {
  test("POSTs to /simulate and prints the verdict", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test", GL_SIGNER_PRIVATE_KEY: KEY },
      router: () => ({
        status: 200,
        json: {
          outcome: "deny",
          reasons: ["payee not on the mandate"],
          evaluatedAt: "2026-08-19T00:00:00Z",
          authorizes: false,
        },
      }),
    });

    expect(await run(["simulate", ...flags], h.ctx)).toBe(0);
    expect(new URL(h.requests[0]!.url).pathname).toBe("/simulate");
    const body = JSON.parse(h.out[0] as string);
    expect(body.outcome).toBe("deny");
    expect(body.authorizes).toBe(false);
  });

  test("never touches the settling route", async () => {
    // The whole point: an operator can ask without paying to find out.
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test", GL_SIGNER_PRIVATE_KEY: KEY },
      router: () => ({
        status: 200,
        json: {
          outcome: "allow",
          reasons: [],
          evaluatedAt: "2026-08-19T00:00:00Z",
          authorizes: false,
        },
      }),
    });

    await run(["simulate", ...flags], h.ctx);
    expect(h.requests.map((r) => new URL(r.url).pathname)).toEqual(["/simulate"]);
  });

  test("a refused verdict still exits 0, because the answer is the deliverable", async () => {
    // A deny is a successful simulation, not a failed command. Exiting non-zero would make
    // scripts treat "the gate would refuse this" as "the tool broke".
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test", GL_SIGNER_PRIVATE_KEY: KEY },
      router: () => ({
        status: 200,
        json: {
          outcome: "deny",
          reasons: ["over cap"],
          evaluatedAt: "2026-08-19T00:00:00Z",
          authorizes: false,
        },
      }),
    });
    expect(await run(["simulate", ...flags], h.ctx)).toBe(0);
  });

  test("refuses without a signer key, since the gate reads a signed envelope", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => ({ status: 200, json: {} }),
    });
    expect(await run(["simulate", ...flags], h.ctx)).not.toBe(0);
    expect(h.requests).toHaveLength(0);
  });
});
