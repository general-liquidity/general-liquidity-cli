import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { run } from "../index.ts";
import { makeHarness, TEST_SEED } from "../internal/testkit.ts";

const CONFIG_PATH = join("/home/test", ".config", "general-liquidity", "config.json");

describe("gl config", () => {
  test("show reports defaults and key presence without leaking secrets", async () => {
    const h = makeHarness({
      env: { GL_BASE_URL: "https://gl.test", GL_SIGNER_PRIVATE_KEY: TEST_SEED },
    });
    const code = await run(["config", "show"], h.ctx);
    expect(code).toBe(0);
    const view = JSON.parse(h.out[0] as string);
    expect(view.baseUrl).toBe("https://gl.test");
    expect(view.authScheme).toBe("bearer");
    expect(view.apiKeyEnv).toBe("GL_API_KEY");
    expect(view.apiKeyPresent).toBe(false);
    expect(view.signerKeyPresent).toBe(true);
    expect(view.agentId.length).toBe(64);
    expect(JSON.stringify(view)).not.toContain(TEST_SEED.slice(2));
  });

  test("path prints the config file location", async () => {
    const h = makeHarness({ env: {} });
    const code = await run(["config", "path"], h.ctx);
    expect(code).toBe(0);
    expect(h.out[0]).toBe(CONFIG_PATH);
  });

  test("set writes the base url and show reflects it", async () => {
    const h = makeHarness({ env: {} });
    const setCode = await run(["config", "set", "base-url", "https://api.gl"], h.ctx);
    expect(setCode).toBe(0);
    expect(h.files.get(CONFIG_PATH)).toContain("https://api.gl");

    const showCode = await run(["config", "show"], h.ctx);
    expect(showCode).toBe(0);
    const view = JSON.parse(h.out[h.out.length - 1] as string);
    expect(view.baseUrl).toBe("https://api.gl");
  });

  test("rejects a bad auth-scheme", async () => {
    const h = makeHarness({ env: {} });
    const code = await run(["config", "set", "auth-scheme", "basic"], h.ctx);
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("auth-scheme");
  });
});
