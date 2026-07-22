import { fromWire } from "@general-liquidity/sdk";
import type { Runtime } from "./config.ts";
import { requireBaseUrl } from "./config.ts";
import type { Context } from "./context.ts";

// The audit trail is a REST GET (/audit), not part of the SDK client surface
// (resolve / pay / verify / disclose), so it is read directly through the injected fetch
// with the same auth the client uses. Response keys are snake_case on the wire and
// projected to camelCase via the SDK's fromWire.

export interface AuditQuery {
  intentKey?: string;
  limit?: number;
}

/** One signed, hash-linked entry, camelCase-projected. Shape mirrors the spec AuditEvent. */
export interface AuditEvent {
  type: string;
  at: string;
  intentKey?: string;
  prev?: string;
  payload: Record<string, unknown>;
}

function auditUrl(rt: Runtime, query: AuditQuery): string {
  const base = requireBaseUrl(rt);
  const url = new URL("audit", base.endsWith("/") ? base : `${base}/`);
  if (query.intentKey) url.searchParams.set("intent_key", query.intentKey);
  if (query.limit != null) url.searchParams.set("limit", String(query.limit));
  return url.toString();
}

export async function fetchAudit(
  ctx: Context,
  rt: Runtime,
  query: AuditQuery,
): Promise<AuditEvent[]> {
  const headers = new Headers({ accept: "application/json" });
  if (rt.apiKey) {
    if (rt.authScheme === "x-api-key") headers.set("x-api-key", rt.apiKey);
    else headers.set("authorization", `Bearer ${rt.apiKey}`);
  }
  const res = await ctx.fetchImpl(auditUrl(rt, query), { method: "GET", headers });
  const body = (await res.json()) as unknown;
  if (!res.ok) {
    const problem = body && typeof body === "object" ? fromWire(body) : { status: res.status };
    throw Object.assign(new Error(`audit request failed (HTTP ${res.status})`), { problem });
  }
  return fromWire(body) as AuditEvent[];
}
