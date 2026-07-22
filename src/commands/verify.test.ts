import { describe, expect, test } from "bun:test";
import { run } from "../index.ts";
import { makeHarness } from "../internal/testkit.ts";

const DISCLOSURE = JSON.stringify({
  agentId: "pubkeyhex",
  document: { name: "acme" },
  signature: "sig",
});

describe("gl verify", () => {
  test("posts the disclosure and prints the camelCase Decision", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      files: { "/tmp/d.json": DISCLOSURE },
      router: () => ({
        status: 200,
        json: { outcome: "allow", reasons: ["ok"], mandate_id: "m1" },
      }),
    });

    const code = await run(["verify", "/tmp/d.json"], h.ctx);
    expect(code).toBe(0);

    const req = h.requests[0];
    expect(req?.url).toBe("https://gl.test/verify");
    expect(req?.body).toMatchObject({ agent_id: "pubkeyhex" });

    const parsed = JSON.parse(h.out[0] as string);
    expect(parsed).toEqual({ outcome: "allow", reasons: ["ok"], mandateId: "m1" });
  });

  test("refuses on a missing file", async () => {
    const h = makeHarness({ env: { GL_BASE_URL: "https://gl.test" } });
    const code = await run(["verify", "/tmp/missing.json"], h.ctx);
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("not found");
  });
});
