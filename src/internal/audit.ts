import type { Runtime } from "./config.ts";
import { requireBaseUrl } from "./config.ts";
import type { Context } from "./context.ts";

// The audit trail is a REST GET (/audit), not part of the SDK client surface
// (resolve / pay / verify / disclose), so it is read directly through the injected fetch
// with the same auth the client uses. An AuditEvent and a problem body are both camelCase
// as served, so nothing is renamed here: this used to run the response through the SDK's
// casing projection, which is gone because the wire never was snake_case.

export interface AuditQuery {
  intentKey?: string;
  limit?: number;
  /** Opaque token from a prior page's `nextCursor`. Absent means "from the start". */
  cursor?: string;
}

/** One signed, hash-linked entry. Shape mirrors the spec AuditEvent. */
export interface AuditEvent {
  type: string;
  at: string;
  intentKey?: string;
  prev?: string;
  payload: Record<string, unknown>;
}

/** The cursor-paged envelope every list route serves. Mirrors the spec `Page`. */
export interface Page<T> {
  data: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

// `/audit` declares exactly two query parameters, `cursor` and `limit`. It has never
// accepted an `intent_key`, and an unknown query parameter is ignored rather than refused,
// so asking for one intent's trail returned the WHOLE chain and looked like it had worked.
// The per-intent slice is a different route with the key in the PATH, where the filter is
// applied server-side, so the caller gets the answer it asked for instead of a superset.
function auditUrl(rt: Runtime, query: AuditQuery): string {
  const base = requireBaseUrl(rt);
  const root = base.endsWith("/") ? base : `${base}/`;
  const url = query.intentKey
    ? new URL(`intents/${encodeURIComponent(query.intentKey)}/events`, root)
    : new URL("audit", root);
  if (query.limit != null) url.searchParams.set("limit", String(query.limit));
  // Both routes declare `cursor`; without it the CLI could only ever read the first page.
  if (query.cursor != null) url.searchParams.set("cursor", query.cursor);
  return url.toString();
}

export async function fetchAudit(
  ctx: Context,
  rt: Runtime,
  query: AuditQuery,
): Promise<Page<AuditEvent>> {
  const headers = new Headers({ accept: "application/json" });
  if (rt.apiKey) {
    if (rt.authScheme === "x-api-key") headers.set("x-api-key", rt.apiKey);
    else headers.set("authorization", `Bearer ${rt.apiKey}`);
  }
  const res = await ctx.fetchImpl(auditUrl(rt, query), { method: "GET", headers });
  const body = (await res.json()) as unknown;
  if (!res.ok) {
    const problem = body && typeof body === "object" ? body : { status: res.status };
    throw Object.assign(new Error(`audit request failed (HTTP ${res.status})`), { problem });
  }
  // `/audit` and `/intents/{id}/events` both serve a `Page` envelope, never a bare array.
  // This was typed as `AuditEvent[]`, so anything indexing the result read `undefined`.
  return body as Page<AuditEvent>;
}
