import type { Intent } from "@general-liquidity/sdk";

// The closed value vocabularies for the six irreducible Terms. Each literal below is
// checked against the SDK wire contract in BOTH directions at compile time: `satisfies`
// rejects a member the SDK does not know, and the `AssertNever` line below each rejects an
// SDK member the literal has not enumerated. A rail added to the SDK and not added here is
// a type error in this file, not a silent divergence at runtime.

// Derive the term types from the SDK's exported Intent so they can never drift from it.
type Terms = Intent["terms"];
export type RailId = Terms["rail"];
export type Reversibility = Terms["reversibility"];
export type Finality = Terms["finality"];
export type CapitalSource = Terms["capitalSource"];
export type Presence = Terms["presence"];

/** Compile-time proof that a union is empty. Instantiating it with a leftover member errors. */
type AssertNever<T extends never> = T;

/** The SDK members a literal failed to enumerate. `never` when the literal is exhaustive. */
type Uncovered<Union, Literal extends readonly unknown[]> = Exclude<Union, Literal[number]>;

export const RAILS = [
  "x402",
  "mpp",
  "ap2",
  "acp",
  "ucp",
  "card",
  "onchain",
  "l402",
  "ach",
  "wire",
] as const satisfies readonly RailId[];
export type UncoveredRails = AssertNever<Uncovered<RailId, typeof RAILS>>;

export const REVERSIBILITY = [
  "reversible",
  "irreversible",
] as const satisfies readonly Reversibility[];
export type UncoveredReversibility = AssertNever<Uncovered<Reversibility, typeof REVERSIBILITY>>;

export const FINALITY = ["instant", "deferred"] as const satisfies readonly Finality[];
export type UncoveredFinality = AssertNever<Uncovered<Finality, typeof FINALITY>>;

export const CAPITAL_SOURCE = [
  "payer",
  "facilitator",
  "merchant_of_record",
  "solver",
] as const satisfies readonly CapitalSource[];
export type UncoveredCapitalSource = AssertNever<Uncovered<CapitalSource, typeof CAPITAL_SOURCE>>;

export const PRESENCE = ["present", "delegated"] as const satisfies readonly Presence[];
export type UncoveredPresence = AssertNever<Uncovered<Presence, typeof PRESENCE>>;
