import { createClient, type GeneralLiquidity, type Signer } from "@general-liquidity/sdk";
import type { Runtime } from "./config.ts";
import { requireBaseUrl } from "./config.ts";
import type { Context, FetchLike } from "./context.ts";

/** Apply the configured auth to every outbound request without clobbering SDK headers. */
export function authedFetch(base: FetchLike, rt: Runtime): FetchLike {
  return (input, init) => {
    if (!rt.apiKey) return base(input, init);
    const headers = new Headers(init?.headers);
    if (rt.authScheme === "x-api-key") headers.set("x-api-key", rt.apiKey);
    else headers.set("authorization", `Bearer ${rt.apiKey}`);
    return base(input, { ...init, headers });
  };
}

/** Build the SDK client bound to the configured server, auth, and operator signer. */
export function buildClient(ctx: Context, rt: Runtime, signer: Signer): GeneralLiquidity {
  return createClient({
    baseUrl: requireBaseUrl(rt),
    signer,
    fetch: authedFetch(ctx.fetchImpl, rt),
  });
}
