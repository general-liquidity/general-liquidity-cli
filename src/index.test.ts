import { describe, expect, test } from "bun:test";
import { run } from "./index.ts";
import { makeHarness } from "./internal/testkit.ts";

describe("gl dispatch", () => {
  test("help exits 0", async () => {
    const h = makeHarness({ env: {} });
    const code = await run(["help"], h.ctx);
    expect(code).toBe(0);
    expect(h.out.join("\n")).toContain("operator CLI for General Liquidity");
  });

  test("no command prints help and exits 1", async () => {
    const h = makeHarness({ env: {} });
    const code = await run([], h.ctx);
    expect(code).toBe(1);
  });

  test("unknown command exits 2", async () => {
    const h = makeHarness({ env: {} });
    const code = await run(["grant"], h.ctx);
    expect(code).toBe(2);
    expect(h.err.join("\n")).toContain("unknown command: grant");
  });
});
