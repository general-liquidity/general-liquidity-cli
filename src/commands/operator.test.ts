import { describe, expect, test } from "bun:test";
import { run } from "../index.ts";
import { makeHarness, TEST_SEED } from "../internal/testkit.ts";

const OPERATOR_ENV = {
  GL_BASE_URL: "https://gl.test",
  GL_OPERATOR_KEY: TEST_SEED,
  GL_OPERATOR_KEY_ID: "ops-1",
};

describe("gl approve", () => {
  test("signs and posts the approval, printing the Receipt", async () => {
    const h = makeHarness({
      env: OPERATOR_ENV,
      router: () => ({
        status: 200,
        json: {
          intentKey: "intent-abc",
          rail: "mpp",
          reference: "psp-ref-1",
          settledAt: "2026-07-22T00:00:00Z",
          enforcement: "hash-abc",
        },
      }),
    });

    const code = await run(
      [
        "approve",
        "--intent-id",
        "intent-abc",
        "--challenge",
        "chal-1",
        "--mandate",
        "m-1",
        "--rationale",
        "operator released after reviewing the counterparty",
        "--ack",
      ],
      h.ctx,
    );
    expect(code).toBe(0);

    const req = h.requests[0];
    expect(req?.url).toBe("https://gl.test/operator/approve");
    expect(req?.method).toBe("POST");
    // Operator authority rides the GL-Operator header, never the agent Authorization.
    expect(req?.headers.get("gl-operator")).toMatch(
      /^v1 keyId="ops-1", ts=\d+, nonce=".+", sig=".+"$/,
    );
    expect(req?.headers.get("authorization")).toBeNull();
    expect(req?.body).toEqual({
      intentId: "intent-abc",
      challenge: "chal-1",
      mandateId: "m-1",
      rationale: "operator released after reviewing the counterparty",
      acknowledged: true,
    });

    const receipt = JSON.parse(h.out[0] as string);
    expect(receipt.reference).toBe("psp-ref-1");
  });

  test("a server refusal exits non-zero with the problem, not a stack", async () => {
    const h = makeHarness({
      env: OPERATOR_ENV,
      router: () => ({
        status: 401,
        json: {
          type: "https://docs.generalliquidity.com/problems/operator.unauthorized",
          code: "operator.unauthorized",
          title: "Operator authority required",
          status: 401,
          detail: "Operator authorization failed: bad_signature.",
        },
      }),
    });

    const code = await run(
      [
        "approve",
        "--intent-id",
        "x",
        "--challenge",
        "c",
        "--mandate",
        "m",
        "--rationale",
        "release the parked intent now",
      ],
      h.ctx,
    );
    expect(code).toBe(1);
    const printed = h.err.join("\n");
    expect(printed).toContain("operator.unauthorized");
    expect(printed).not.toContain("at ");
  });

  test("refuses without the required flags (exit 2)", async () => {
    const h = makeHarness({ env: OPERATOR_ENV });
    const code = await run(["approve", "--intent-id", "x"], h.ctx);
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("usage: gl approve");
  });

  test("refuses a too-short rationale (exit 2)", async () => {
    const h = makeHarness({ env: OPERATOR_ENV });
    const code = await run(
      ["approve", "--intent-id", "x", "--challenge", "c", "--mandate", "m", "--rationale", "short"],
      h.ctx,
    );
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("at least 10 characters");
  });
});

describe("gl refund", () => {
  test("posts a partial refund and prints the result", async () => {
    const h = makeHarness({
      env: OPERATOR_ENV,
      router: () => ({ status: 200, json: { ok: true, refundedMinor: 500 } }),
    });
    const code = await run(
      [
        "refund",
        "--intent-id",
        "intent-abc",
        "--amount-minor",
        "500",
        "--rationale",
        "duplicate charge reversed",
      ],
      h.ctx,
    );
    expect(code).toBe(0);
    expect(h.requests[0]?.url).toBe("https://gl.test/operator/refund");
    expect(h.requests[0]?.body).toEqual({
      intentId: "intent-abc",
      amountMinor: 500,
      rationale: "duplicate charge reversed",
    });
    expect(JSON.parse(h.out[0] as string)).toEqual({ ok: true, refundedMinor: 500 });
  });

  test("a refused (irreversible) refund exits non-zero", async () => {
    const h = makeHarness({
      env: OPERATOR_ENV,
      router: () => ({
        status: 409,
        json: {
          type: "https://docs.generalliquidity.com/problems/operator.refused",
          code: "operator.refused",
          title: "Operator action refused",
          status: 409,
          reasons: ["settlement is irreversible"],
        },
      }),
    });
    const code = await run(
      ["refund", "--intent-id", "intent-abc", "--rationale", "attempted reversal of a charge"],
      h.ctx,
    );
    expect(code).toBe(1);
    expect(h.err.join("\n")).toContain("operator.refused");
  });
});

describe("gl kill-switch", () => {
  test("engage and disengage hit the same route with different signatures", async () => {
    const engage = makeHarness({
      env: OPERATOR_ENV,
      router: () => ({ status: 200, json: { killSwitchEngaged: true, circuitBreakerOpen: false } }),
    });
    expect(
      await run(
        ["kill-switch", "engage", "--rationale", "freezing settle during incident"],
        engage.ctx,
      ),
    ).toBe(0);
    expect(engage.requests[0]?.url).toBe("https://gl.test/operator/kill-switch");
    expect(engage.requests[0]?.body).toEqual({
      engaged: true,
      rationale: "freezing settle during incident",
    });

    const disengage = makeHarness({
      env: OPERATOR_ENV,
      router: () => ({
        status: 200,
        json: { killSwitchEngaged: false, circuitBreakerOpen: false },
      }),
    });
    expect(
      await run(
        ["kill-switch", "disengage", "--rationale", "incident resolved, resuming"],
        disengage.ctx,
      ),
    ).toBe(0);
    expect(disengage.requests[0]?.body).toEqual({
      engaged: false,
      rationale: "incident resolved, resuming",
    });

    const engageSig = engage.requests[0]?.headers.get("gl-operator");
    const disengageSig = disengage.requests[0]?.headers.get("gl-operator");
    expect(engageSig).not.toBe(disengageSig);
  });

  test("rejects an unknown direction (exit 2)", async () => {
    const h = makeHarness({ env: OPERATOR_ENV });
    const code = await run(["kill-switch", "toggle", "--rationale", "some rationale here"], h.ctx);
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("engage|disengage");
  });
});

describe("gl reset-breaker", () => {
  test("clears the breaker and prints the state", async () => {
    const h = makeHarness({
      env: OPERATOR_ENV,
      router: () => ({
        status: 200,
        json: { killSwitchEngaged: false, circuitBreakerOpen: false },
      }),
    });
    const code = await run(
      ["reset-breaker", "--rationale", "breaker cleared after venue recovery"],
      h.ctx,
    );
    expect(code).toBe(0);
    expect(h.requests[0]?.url).toBe("https://gl.test/operator/circuit-breaker/reset");
    expect(h.requests[0]?.body).toEqual({ rationale: "breaker cleared after venue recovery" });
  });
});

describe("operator key handling", () => {
  test("missing operator key exits 2 with a clear message and no seed echo", async () => {
    const h = makeHarness({ env: { GL_BASE_URL: "https://gl.test", GL_OPERATOR_KEY_ID: "ops-1" } });
    const code = await run(["reset-breaker", "--rationale", "clearing the tripped breaker"], h.ctx);
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("no operator key");
  });

  test("missing key id exits 2", async () => {
    const h = makeHarness({ env: { GL_BASE_URL: "https://gl.test", GL_OPERATOR_KEY: TEST_SEED } });
    const code = await run(["reset-breaker", "--rationale", "clearing the tripped breaker"], h.ctx);
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("no operator key id");
  });

  test("reads the seed from a --key file, never echoing it", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test", GL_OPERATOR_KEY_ID: "ops-1" },
      files: { "/keys/op.seed": `${TEST_SEED}\n` },
      router: () => ({
        status: 200,
        json: { killSwitchEngaged: false, circuitBreakerOpen: false },
      }),
    });
    const code = await run(
      ["reset-breaker", "--rationale", "clearing the tripped breaker", "--key", "/keys/op.seed"],
      h.ctx,
    );
    expect(code).toBe(0);
    expect(h.requests[0]?.headers.get("gl-operator")).toContain('keyId="ops-1"');
    // The seed never appears in any output stream.
    const all = [...h.out, ...h.err].join("\n");
    expect(all).not.toContain("1111");
  });

  test("an invalid seed exits 2 without echoing the value", async () => {
    const h = makeHarness({
      env: {
        GL_BASE_URL: "https://gl.test",
        GL_OPERATOR_KEY: "not-a-valid-hex-seed",
        GL_OPERATOR_KEY_ID: "ops-1",
      },
    });
    const code = await run(["reset-breaker", "--rationale", "clearing the tripped breaker"], h.ctx);
    expect(code).toBe(2);
    const printed = h.err.join("\n");
    expect(printed).toContain("32-byte ed25519 seed");
    expect(printed).not.toContain("not-a-valid-hex-seed");
  });
});
