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

Value vocabularies: `--rail` is one of `x402 mpp ap2 acp ucp card onchain`;
`--reversibility` is `reversible | irreversible`; `--finality` is `instant | deferred`;
`--capital-source` is `payer | facilitator | merchant_of_record | solver`; `--presence` is
`present | delegated`.

### audit

Read the signed, hash-linked audit trail (`GET /audit`).

```sh
gl audit --intent-key k_123 --limit 50 --pretty
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

## Documented gap: no `grant` command

The canonical GL surface lists `grant` (operator issues or revokes a scoped `Mandate`) as
governance, but the current SDK client (`resolve`, `pay`, `verify`, `disclose`) and the
OpenAPI spec expose no grant operation. Mandate issuance is therefore out of scope for this
CLI until the server surfaces it. The CLI does not ship a fake `grant`.

## Development

```sh
bun install
bun run typecheck    # tsc --noEmit
bun test             # bun:test
bun run lint         # biome check .
```

## License

MIT
