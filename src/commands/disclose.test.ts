import { describe, expect, test } from "bun:test";
import { run } from "../index.ts";
import { makeHarness, TEST_SEED } from "../internal/testkit.ts";

describe("gl disclose", () => {
  test("fetches the document and signs it locally", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test", GL_SIGNER_PRIVATE_KEY: TEST_SEED },
      router: () => ({ status: 200, json: { subject: "gl", version: 1 } }),
    });

    const code = await run(["disclose"], h.ctx);
    expect(code).toBe(0);

    expect(h.requests[0]?.url).toBe("https://gl.test/disclose");

    const parsed = JSON.parse(h.out[0] as string);
    expect(parsed.document).toEqual({ subject: "gl", version: 1 });
    expect(typeof parsed.agentId).toBe("string");
    expect(parsed.agentId.length).toBe(64);
    expect(typeof parsed.signature).toBe("string");
    expect(parsed.signature.length).toBeGreaterThan(0);
  });

  test("refuses with no signer key", async () => {
    const h = makeHarness({ env: { GL_BASE_URL: "https://gl.test" } });
    const code = await run(["disclose"], h.ctx);
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("no signer key");
  });
});
