import type { Intent } from "@general-liquidity/sdk";

// The closed value vocabularies for the six irreducible Terms, sourced from the SDK
// wire contract (types.ts) and the OpenAPI spec. These are structural enums, not a
// mutable data list, so they are encoded here for validation and help output.

export const RAILS = ["x402", "mpp", "ap2", "acp", "ucp", "card", "onchain"] as const;
export const REVERSIBILITY = ["reversible", "irreversible"] as const;
export const FINALITY = ["instant", "deferred"] as const;
export const CAPITAL_SOURCE = ["payer", "facilitator", "merchant_of_record", "solver"] as const;
export const PRESENCE = ["present", "delegated"] as const;

// Derive the term types from the SDK's exported Intent so they can never drift from it.
type Terms = Intent["terms"];
export type RailId = Terms["rail"];
export type Reversibility = Terms["reversibility"];
export type Finality = Terms["finality"];
export type CapitalSource = Terms["capitalSource"];
export type Presence = Terms["presence"];
