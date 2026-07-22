import { describe, expect, test } from "bun:test";
import { run } from "../index.ts";
import { makeHarness } from "../internal/testkit.ts";

describe("gl resolve", () => {
  test("posts the ref and prints the camelCase Counterparty", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test" },
      router: () => ({
        status: 200,
        json: {
          id: "agent:acme",
          transport: "disclosure",
          capabilities: ["pay"],
          rails: ["x402"],
          trust: { score: 1 },
        },
      }),
    });

    const code = await run(["resolve", "agent:acme"], h.ctx);
    expect(code).toBe(0);

    const req = h.requests[0];
    expect(req?.method).toBe("POST");
    expect(req?.url).toBe("https://gl.test/resolve");
    expect(req?.body).toEqual({ ref: "agent:acme" });

    const parsed = JSON.parse(h.out[0] as string);
    expect(parsed.transport).toBe("disclosure");
    expect(parsed.rails).toEqual(["x402"]);
  });

  test("refuses with no ref", async () => {
    const h = makeHarness({ env: { GL_BASE_URL: "https://gl.test" } });
    const code = await run(["resolve"], h.ctx);
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("usage: gl resolve");
  });

  test("refuses with no server configured", async () => {
    const h = makeHarness({ env: {} });
    const code = await run(["resolve", "x"], h.ctx);
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("no server configured");
  });
});
