import { describe, expect, test } from "bun:test";
import { run } from "../index.ts";
import { makeHarness } from "../internal/testkit.ts";

const DISCLOSURE = JSON.stringify({
  document: { name: "acme" },
  signature: { algorithm: "ed25519", publicKey: "pubkeyhex", value: "sig" },
});

describe("gl verify", () => {
  test("posts the disclosure unrenamed and prints the Decision", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      files: { "/tmp/d.json": DISCLOSURE },
      router: () => ({
        status: 200,
        json: { outcome: "allow", reasons: ["ok"], mandateId: "m1" },
      }),
    });

    const code = await run(["verify", "/tmp/d.json"], h.ctx);
    expect(code).toBe(0);

    const req = h.requests[0];
    expect(req?.url).toBe("https://gl.test/verify");
    // The disclosure crosses the wire unrenamed, which is what makes its signature verifiable.
    expect(req?.body).toMatchObject({ signature: { publicKey: "pubkeyhex" } });

    const parsed = JSON.parse(h.out[0] as string);
    expect(parsed).toEqual({ outcome: "allow", reasons: ["ok"], mandateId: "m1" });
  });

  test("round-trips the named checks and reports the failed ids on a deny", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      files: { "/tmp/d.json": DISCLOSURE },
      router: () => ({
        status: 200,
        json: {
          outcome: "deny",
          reasons: ["payee not on the mandate"],
          mandateId: "m1",
          checks: [
            { id: "mandate.active", passed: true },
            { id: "mandate.payee_allowed", passed: false },
            { id: "terms.reversibility_permitted", passed: false },
          ],
        },
      }),
    });

    const code = await run(["verify", "/tmp/d.json"], h.ctx);
    expect(code).toBe(0);

    // stdout carries the whole Decision, checks included, so a pipe still gets everything.
    const parsed = JSON.parse(h.out[0] as string);
    expect(parsed.checks).toHaveLength(3);
    expect(parsed.checks[1]).toEqual({ id: "mandate.payee_allowed", passed: false });

    // The operator-facing line names the predicates, not the prose.
    expect(h.err.join("\n")).toBe(
      "deny: failed checks: mandate.payee_allowed, terms.reversibility_permitted",
    );
  });

  test("says nothing extra when the gate sent no checks", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      files: { "/tmp/d.json": DISCLOSURE },
      router: () => ({
        status: 200,
        json: { outcome: "deny", reasons: ["no"], mandateId: "m1" },
      }),
    });
    expect(await run(["verify", "/tmp/d.json"], h.ctx)).toBe(0);
    expect(h.err).toEqual([]);
  });

  test("refuses on a missing file", async () => {
    const h = makeHarness({ env: { GL_BASE_URL: "https://gl.test" } });
    const code = await run(["verify", "/tmp/missing.json"], h.ctx);
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("not found");
  });
});
