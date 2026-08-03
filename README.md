# @general-liquidity/cli

Operator command-line tool for General Liquidity, the API for the machine economy.

`gl` is an operator tool, not another client library. It talks to a running GL server
through the published SDK (`@general-liquidity/sdk`): it resolves counterparties, verifies
disclosures, submits governed pay intents signed by the operator key, and reads the signed
audit trail. The server holds the settle primitive; the CLI only ever signs and submits.

## Install

Requires [Bun](https://bun.sh) 1.3.7 or newer.

```sh
bun install
bun link            # exposes the `gl` binary
# or run directly:
bun src/index.ts <command>
```

The binary is `gl` (`"bin": { "gl": "./src/index.ts" }`).

## Configuration

Settings come from a config file plus environment variables. Secrets are read from the
environment only. They are never written to the config file and never hardcoded.

```sh
gl config path                              # print the config file location
gl config show                              # show resolved config and whether keys are present
gl config set base-url https://api.gl.test  # persist the server URL
gl config set auth-scheme bearer            # bearer (default) or x-api-key
gl config get base-url
```

The config file (default `~/.config/general-liquidity/config.json`, override with
`GL_CONFIG`) stores only: `baseUrl`, the auth scheme, and the NAMES of the env vars that
hold the secrets. It never stores the secrets themselves.

### Environment variables

| Variable | Purpose |
|---|---|
| `GL_BASE_URL` | Base URL of the running GL server. Overrides the config file. |
| `GL_API_KEY` | Server API key. The env-var name is configurable via `api-key-env`. |
| `GL_SIGNER_PRIVATE_KEY` | Operator ed25519 signing seed (64 hex chars, optionally `0x`). The env-var name is configurable via `signer-key-env`. |
| `GL_CONFIG` | Override the config file path. |

The signer seed is a 32-byte ed25519 key. Its public key is the operator `agentId`. The
key stays in the process: the SDK only ever calls `sign(bytes)`.

## Commands

Output is single-line JSON by default (machine friendly). Add `--pretty` to indent.

### resolve

Normalize a counterparty reference (A2A card, signed disclosure id, or CAIP account) into
one `Counterparty`.

```sh
gl resolve agent:acme --pretty
```

### verify

Check a counterparty's signed disclosure against policy and print the `Decision`.

```sh
gl verify ./counterparty-disclosure.json
```

### disclose

Print this operator's own signed disclosure. The server supplies the disclosure document;
the CLI signs it locally with the operator key, so the signature binds to the operator, not
the server.

```sh
gl disclose --pretty
```

### pay

Submit a governed pay intent. The operator key signs the grant and the SDK signs the intent
envelope; the sovereign gate on the server decides and, on allow, settles and returns a
`Receipt`. On deny the server's RFC 7807 problem is printed to stderr. The six Terms are
required flags and are never silently defaulted.

```sh
gl pay \
  --payee 0xF00... \
  --amount 1000 \
  --asset USDC \
  --purpose "api credits" \
  --rail x402 \
  --reversibility irreversible \
  --finality instant \
  --credential eip3009 \
  --capital-source payer \
  --presence delegated \
  --mandate m_ops_daily
```

Optional: `--expires <iso>` (grant expiry, default 24h), `--idempotency-key <k>` (the SDK
generates one when omitted).

Value vocabularies: `--rail` is one of `x402 mpp ap2 acp ucp card onchain l402 ach wire`;
`--reversibility` is `reversible | irreversible`; `--finality` is `instant | deferred`;
`--capital-source` is `payer | facilitator | merchant_of_record | solver`; `--presence` is
`present | delegated`.

**Rails are supplied by the operator, not by the server.** The gateway constructs only
`x402` itself; every other rail is passed in through `GatewayConfig.rails`. So the list above
is what the gate will authorize, not what any given deployment can settle — that depends on
which rails the operator wired and what each one needs underneath it. `card` needs a
PSP/acquirer client, `ach` and `wire` need an ODFI or processor, `l402` needs a Lightning
payer. None of those are shipped, deliberately: this stack holds no rail credential.

Two of them also live outside the gateway's dependencies. `ach` and `wire` come from
`@general-liquidity/bank-rails` and `l402` from `@general-liquidity/l402`, so an operator
adds that workspace dependency and constructs the rail. Both packages are complete, with
banking-day arithmetic, return-code classification and cutoff forecasting on the bank side.

The semantics of the two bank rails are worth stating because they drive the
`--reversibility` and `--finality` you would pair them with, and the gate reads them from
its own table rather than trusting what a caller claims. `ach` is
reversible with deferred finality and a return window measured in days, so money can still
be taken back by the receiving bank after the Receipt exists. `wire` is irreversible with
instant finality and no return window, and a wire submitted after the bank's daily cutoff
should be refused rather than queued, because there is no honest Receipt claiming instant
finality for a message that has not left the bank.

### quote

Price a cart against a merchant over a checkout protocol (`POST /quote`). Commits nothing
and moves no money, so it needs no signer key and no mandate: it prints the
server-authoritative `Cart` the merchant priced.

```sh
gl quote --rail acp \
  --merchant shop.example \
  --currency USD \
  --line sku-1:2 \
  --line sku-2:1 \
  --pretty
```

`--rail` takes a checkout protocol only, `acp` or `ucp`. A `RailId` that is not a checkout
protocol — `x402`, `card`, `wire` — is refused here rather than dispatched to a merchant
that cannot speak it.

`--line` is `<itemId>:<quantity>`, repeatable, at least one required. It splits on the last
colon, so an item id may itself contain one (`--line urn:sku:1:3` is three of `urn:sku:1`).
A zero, negative or fractional quantity is refused before the request leaves, because a cart
the merchant rejects costs a round trip and reports the failure in the merchant's vocabulary
instead of this one's.

Only a `Cart` in status `ready` can go on to be bought. Every other status — `priced`,
`escalation_required`, `authorized`, `completed`, `canceled` — is the refusal reporting what
the checkout still needs.

Commerce is an opt-in tier. A deployment that did not enable it answers `not_found` on this
path exactly as if it never existed.

### audit

Read the signed, hash-linked audit trail (`GET /audit`). With `--intent-key` it reads that
intent's slice instead (`GET /intents/{key}/events`), which is where the server applies the
filter: `/audit` accepts only `cursor` and `limit`.

Either way the output is the server's page envelope, `{ data, has_more, next_cursor }`, so a
partial trail is visible as one rather than reading like the whole chain.

`--limit` is 1..100, the server's own bound. The server clamps a larger value silently, which
on an audit log would look like the end of the evidence rather than a short page, so the CLI
refuses it and points at `--cursor` instead. Pass a prior page's `next_cursor` to `--cursor`
to read on; `has_more: false` is the end.

```sh
gl audit --limit 50 --pretty
gl audit --limit 50 --cursor 4f2c... --pretty
gl audit --intent-key k_123 --pretty
```

### testnet-pay

Governed live settlement on Base Sepolia, adapted from the platform testnet runner. It is
env-driven, refuses to run without the required secrets, and refuses a non-testnet chain
unless `GL_ALLOW_MAINNET=1` (the guard is keyed on the chain id, not a label, so a renamed
config cannot slip past it). It signs and submits a governed on-chain USDC intent through
the SDK; the server holds the settler and the x402 facilitator.

```sh
export GL_BASE_URL=https://sandbox.api.gl.test
export GL_SIGNER_PRIVATE_KEY=0x...      # operator signing seed
export GL_FACILITATOR_URL=https://x402.org/facilitator
export GL_PAY_TO=0x1111...              # 0x recipient address
# optional: GL_NETWORK=base-sepolia (default) | base, GL_AMOUNT_ATOMIC=1000, GL_MANDATE=...
gl testnet-pay --pretty
```

## Safety posture

- Keys come from the environment (or the config file's env-var names), never hardcoded,
  never committed. `.env` files are gitignored.
- `config show` reports only whether a key is present, never the value.
- `pay` and `disclose` refuse cleanly when no signer key is set.
- `testnet-pay` defaults to Base Sepolia and refuses mainnet unless `GL_ALLOW_MAINNET=1`;
  it refuses to start when any required secret is absent.
- The CLI never holds a settle primitive. It signs intents and submits them; the sovereign
  gate on the server decides and settles.

## Documented gaps

### No mandate command

You cannot issue or revoke a `Mandate` from this CLI, but not because the capability is
missing. Mandate issuance exists: `mandate/create` grants bounded, revocable spending
authority, with a per-authorization ceiling, a cumulative ceiling over a rolling period, an
expiry that lapses whatever is left, and a closed set of payees.

It lives on the **protocol tier**, served from the platform's meta-model and published live
at `GET /openapi.json`, alongside `mandate/get` and the rest of the governed kernel. This
CLI is built against the **product tier** (`spec/openapi.yaml`), which does not carry those
methods, so the SDK it delegates to cannot reach them either.

That matters more than it sounds: a mandate is where the blast radius of everything an agent
later does is fixed, and this CLI can spend under one but not create one. Until the product
tier carries mandate issuance, reach it through the protocol tier directly. The CLI does not
ship a fake `grant`.

### No `buy` command

`gl quote` ships; `gl buy` does not. A `BuyRequest` carries a mandate-bearing envelope whose
signature the gate verifies, but the intent the gate evaluates for a buy is constructed
server-side from the merchant's own cart, so this CLI cannot build the signed preimage the
way `pay` does through the SDK's `signIntent`. A `buy` that guessed at that preimage would
emit requests the gate refuses, which is worse than not shipping it.

This affects only the CLI. `POST /buy` is on the REST surface, `client.buy()` is on the SDK,
and the MCP server exposes a `buy` tool — in all three the caller supplies an
already-signed envelope rather than constructing one. The reason is recorded at the top of
`src/commands/commerce.ts`.

## Development

```sh
bun install
bun run typecheck    # tsc --noEmit
bun test             # bun:test
bun run lint         # biome check .
```

## License

MIT
