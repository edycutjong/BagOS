# Changelog

All notable changes to this project are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [2.5.1](https://github.com/edycutjong/BagOS/compare/v2.5.0...v2.5.1) (2026-08-16)


### Bug Fixes

* **ci:** publish when the fallback cuts the release, not only release-please ([d590474](https://github.com/edycutjong/BagOS/commit/d5904747a0bcab787dd70d55827ab96e0918d0c9))

## [2.5.0](https://github.com/edycutjong/BagOS/compare/v2.4.1...v2.5.0) (2026-08-16)


### Features

* **assets:** a dev.to cover at the size dev.to actually uses ([479d72e](https://github.com/edycutjong/BagOS/commit/479d72e851c398c5ece3fefb6dbcd807e8511927))


### Bug Fixes

* **ci:** cut the release when release-please declines to ([7c46cd5](https://github.com/edycutjong/BagOS/commit/7c46cd557fb37951edca88ae0a1bc5017dca044a))
* **proof:** close the keypair TOCTOU race, and document what is knowingly broken ([ccfe362](https://github.com/edycutjong/BagOS/commit/ccfe362e25bf7d9c54dcaf5ac933c4ca0481b155))

## [2.4.1](https://github.com/edycutjong/BagOS/compare/v2.4.0...v2.4.1) (2026-08-15)


### Bug Fixes

* **ci:** self-heal the release label handoff instead of only detecting it ([474ae0c](https://github.com/edycutjong/BagOS/commit/474ae0c5bd3ac9a7ca9c89e6d4d1e84ad39b9328))
* **readme:** the Smithery badge rendered as a broken image ([b2b4126](https://github.com/edycutjong/BagOS/commit/b2b41262511011dbe4d7cbb0b3c4c7550fc8d14d))

## [2.4.0](https://github.com/edycutjong/BagOS/compare/v2.3.0...v2.4.0) (2026-08-15)


### Features

* **proof:** capture the on-chain receipt, and fix the bug that blocked it ([62d41bc](https://github.com/edycutjong/BagOS/commit/62d41bc38509aa5631f544dbd6e9e3e4f786f3ef))


### Bug Fixes

* **ci:** clear three failures that were noise, not signal ([c8088a6](https://github.com/edycutjong/BagOS/commit/c8088a6403be2667f5b6f3b1584c88abc895b5ea))
* **ci:** grant release-please label permission, and fail loudly when it jams ([4fff77b](https://github.com/edycutjong/BagOS/commit/4fff77bd02e6aa369ebfa69927a450093484ee5f))
* **mcpb:** declare the tool list in the manifest, so registries can read it ([a2301c1](https://github.com/edycutjong/BagOS/commit/a2301c1197a10698b07ab0538fa19c9965118d6e))
* **mcpb:** include inputSchema in the declared tools ([0b69617](https://github.com/edycutjong/BagOS/commit/0b69617a125a82e28a054b3a665ae8397139f7da))
* **proof:** persist the devnet payer, so "fund it and re-run" actually works ([e0b2673](https://github.com/edycutjong/BagOS/commit/e0b26733e1e49f1f1d758add7926a6d741d6b7b7))


### Reverts

* drop the manifest tool declaration — the two validators disagree ([c4b07cd](https://github.com/edycutjong/BagOS/commit/c4b07cd37a5f0d4f112d618535bfefd1d701719c))


### Documentation

* correct two stale claims in the README ([607b6c0](https://github.com/edycutjong/BagOS/commit/607b6c05bdc2927ca5a2293ba2c65b039a68c8d6))

## [2.3.0](https://github.com/edycutjong/BagOS/compare/v2.2.0...v2.3.0) (2026-08-15)


### Features

* **assets:** the OG card's call to action names a destination ([dd293e3](https://github.com/edycutjong/BagOS/commit/dd293e327edd8ab82e89a9ba3651a1a5be7e666c))
* **site:** badge every registry that serves this server, and mac the terminal ([cd965e1](https://github.com/edycutjong/BagOS/commit/cd965e1b6274059c1eb771b00daeb0f3dcec0b08))
* **site:** drift the grid on scroll, and match the header wordmark to the card ([4036c51](https://github.com/edycutjong/BagOS/commit/4036c5161587d44d3f76b920e401485bcc9c82fe))
* **site:** play the gate on scroll, and fit the social metadata to its budgets ([1c383a9](https://github.com/edycutjong/BagOS/commit/1c383a931f92d6da1f5675ce4112f73446dde1b7))
* **site:** rebuild the page on its own design system ([e48cb8a](https://github.com/edycutjong/BagOS/commit/e48cb8a5ae2ea77114e194a5f5c3b7c525ee1549))
* **site:** run the grid behind the whole page, not just the hero ([7d6bda9](https://github.com/edycutjong/BagOS/commit/7d6bda946b008dcc0b19b0a1610cac7ed9b33c0f))
* **site:** styled nav, a light theme, and an ambient pass of light ([6d5f56b](https://github.com/edycutjong/BagOS/commit/6d5f56b21c118c5d1826ab8ebcf08f82d5c95775))
* **site:** substitute an explicit __V__ marker for the release version ([e077433](https://github.com/edycutjong/BagOS/commit/e077433e74c4171faf2e2c53c655a79a6d596dc5))


### Bug Fixes

* **assets:** centre the held packet in its ring, and the ticks above their nodes ([d4249f0](https://github.com/edycutjong/BagOS/commit/d4249f05f218662aeb3745b8af8af32510ee43b7))
* **assets:** render the OG card at 1200x630 and declare that size ([4909bf7](https://github.com/edycutjong/BagOS/commit/4909bf78016a962844a14ab0f7cb24a4bf21a0b1))
* **ci:** publish to the edy-cu Smithery namespace ([3b4cdc6](https://github.com/edycutjong/BagOS/commit/3b4cdc6398c2fb88c67d1c3e12439578eccea400))
* **ci:** select the registry's latest version, and bundle under Smithery's limit ([ef2e65e](https://github.com/edycutjong/BagOS/commit/ef2e65eb1918761c292eba84b0150ec450d3983a))
* **server:** list tools without credentials, so clients can discover them ([41967ad](https://github.com/edycutjong/BagOS/commit/41967adf21ac36c291c90f4b6acf830d1ba72dd5))
* **site:** actually load Space Grotesk, self-hosted ([3e61aa4](https://github.com/edycutjong/BagOS/commit/3e61aa4f6cf5f11014f9d6abb977b176ae6a392d))
* **site:** stop hard-coding the release version, and size the deck's OG image ([1f30e14](https://github.com/edycutjong/BagOS/commit/1f30e14865dbe1f78868e78d7a6fc38d18ec4673))
* **site:** the headline underline struck through the line below it ([618864c](https://github.com/edycutjong/BagOS/commit/618864c94f5ba9b0bd2d818dfbf0de9cc27875ee))
* **site:** the toolset split was wrong on the page and the deck ([ea2a260](https://github.com/edycutjong/BagOS/commit/ea2a2605e8594636f0b5151706ef7c00af67904a))
* **smithery:** publish to the edycutjong namespace ([a88b8bf](https://github.com/edycutjong/BagOS/commit/a88b8bf23d3c9f6dd8cfc1a20c2a82cf69e5be40))


### Documentation

* cover all 14 tools, and drop the media-dir nothing referenced ([1171c58](https://github.com/edycutjong/BagOS/commit/1171c582a6b27ba70492d0dbcf83f8c3ece57d2f))
* redraw the architecture diagram from the source, and show it ([c4ebacf](https://github.com/edycutjong/BagOS/commit/c4ebacfa6eff799b605f02335b2c8122b40761f5))


### CI/CD

* log the Smithery token's identity and namespaces before publishing ([7e6ce6c](https://github.com/edycutjong/BagOS/commit/7e6ce6c77cb7a99f5aed34ba873e8900ca17a676))
* mirror releases to GitHub Packages with a redirecting README ([dfc67eb](https://github.com/edycutjong/BagOS/commit/dfc67ebaaebbc7fa7fc56a8b81d9926471d204e2))

## [2.2.0](https://github.com/edycutjong/BagOS/compare/v2.1.0...v2.2.0) (2026-08-15)


### Features

* build an MCPB bundle for Smithery's stdio release type ([ce0a968](https://github.com/edycutjong/BagOS/commit/ce0a968deef01c95319bd60238c7a8570cd348fc))


### Bug Fixes

* **ci:** redeploy the site when the version changes, add a release badge ([9e8723c](https://github.com/edycutjong/BagOS/commit/9e8723c14b19c6dac050609d3a80ef1894024387))
* **docs:** restore the canonical BagOS repo casing in links ([982ffb1](https://github.com/edycutjong/BagOS/commit/982ffb185866e6f888846d1d4cb087ca1fd7de0c))
* **pkg:** declare Node 22 as the real floor, document USE_MOCK_DATA ([f9ae229](https://github.com/edycutjong/BagOS/commit/f9ae2296d8b73b2bfedfe9151c042479a0e4e439))
* **security:** route every tool error through the redaction helper ([e658886](https://github.com/edycutjong/BagOS/commit/e658886f187e90f4bcd408cbb7999491489360c6))


### Documentation

* correct the USE_MOCK_DATA claim and the repo URL casing ([924870e](https://github.com/edycutjong/BagOS/commit/924870ee6054c241d2bbb7f3d23b1c59fd7ec521))
* update the test count to 337 across README and site ([318ed5a](https://github.com/edycutjong/BagOS/commit/318ed5aee6aab916125a43c8c4861ed01c766a29))


### CI/CD

* publish the MCPB bundle to Smithery on release ([4301038](https://github.com/edycutjong/BagOS/commit/4301038d702149e42ad21799a430078015534789))
* publish to the MCP registry on release, and surface its version ([fefab6b](https://github.com/edycutjong/BagOS/commit/fefab6b88c1aaf035e3cbb07dca3361af5cf38a8))

## [2.1.0](https://github.com/edycutjong/BagOS/compare/v2.0.0...v2.1.0) (2026-08-15)


### Features

* **site:** make the gate the hero, add release provenance and inline marks ([140d07b](https://github.com/edycutjong/BagOS/commit/140d07bfb509094d2792327ee2a97cedacba7b39))


### Bug Fixes

* **ci:** download mcp-publisher to a file instead of piping curl into tar ([e7cda82](https://github.com/edycutjong/BagOS/commit/e7cda828d2b5209d0d222f27b2247cd4a9725127))
* **ci:** grant id-token at the caller so the reusable publish can request it ([6bcf515](https://github.com/edycutjong/BagOS/commit/6bcf5154a521b32ace88219ce33205d4e9154da0))
* **ci:** replace the unpassable npm audit gate with a ratchet ([3d1daf0](https://github.com/edycutjong/BagOS/commit/3d1daf04e82bf5ed19d38516cdbb90d84161e6b5))
* **security:** clear every patchable advisory via version-scoped overrides ([089541e](https://github.com/edycutjong/BagOS/commit/089541e5a02d4f6f5b6e860c09feaed238e8718c))
* **security:** override the SDK's exact pins to patched transitives ([97c03d7](https://github.com/edycutjong/BagOS/commit/97c03d7f8c0194d4ed01d1e944020b5390e89ae6))
* **security:** validate the auth callback before writing it to disk ([a374c6a](https://github.com/edycutjong/BagOS/commit/a374c6a0fdd61d20081c2f8c9aa5bbe7d0b8be1b))
* **site:** stamp the version at build time so releases do not strand it ([82f0789](https://github.com/edycutjong/BagOS/commit/82f0789e2c2b6153b0a3e749ad065ccbfb1032cd))


### Documentation

* 2.0.0 is live on npm — drop the install-from-source workaround ([8c419bb](https://github.com/edycutjong/BagOS/commit/8c419bb523075ef96209e4a55bc027d420bdd126))
* three factual corrections found in a full README audit ([0e2663c](https://github.com/edycutjong/BagOS/commit/0e2663c4a0e8243c21efb8e2e9197223fe614899))


### Build System

* **deps:** bump @hono/node-server from 1.19.14 to 1.19.17 ([#5](https://github.com/edycutjong/BagOS/issues/5)) ([4a37bc9](https://github.com/edycutjong/BagOS/commit/4a37bc9351909e81fea61f269befaf93fd44582e))
* **deps:** bump brace-expansion ([#8](https://github.com/edycutjong/BagOS/issues/8)) ([fc51ec0](https://github.com/edycutjong/BagOS/commit/fc51ec09205395ab1024ea24b9ba35f99084f874))
* **deps:** bump fast-uri from 3.1.0 to 3.1.5 ([#6](https://github.com/edycutjong/BagOS/issues/6)) ([23d86a1](https://github.com/edycutjong/BagOS/commit/23d86a1da8055612d957ddc21a5034d0f1fd26ee))
* **deps:** bump hono from 4.12.14 to 4.13.2 ([#4](https://github.com/edycutjong/BagOS/issues/4)) ([5650213](https://github.com/edycutjong/BagOS/commit/56502131bca094b4631cc09ebb11a5f8d6a90ae9))
* **deps:** bump the actions group across 1 directory with 3 updates ([#3](https://github.com/edycutjong/BagOS/issues/3)) ([f8e99b5](https://github.com/edycutjong/BagOS/commit/f8e99b5c61d2253420e33e61c0c9afa746221e16))
* **deps:** bump the minor-and-patch group across 1 directory with 9 updates ([#2](https://github.com/edycutjong/BagOS/issues/2)) ([0afe599](https://github.com/edycutjong/BagOS/commit/0afe599d26c88d06568b206f1b716c1aa0a8766f))


### CI/CD

* automate semantic versioning with release-please ([b3469aa](https://github.com/edycutjong/BagOS/commit/b3469aa3876da162d6fd27c469524b5cc8b2b728))
* drop EOL Node 20, Solana badge to brand purple ([54870a6](https://github.com/edycutjong/BagOS/commit/54870a69750a32d89198fb2f9cf93cfd87180cd4))
* gate publish on a tarball audit ([c6894f2](https://github.com/edycutjong/BagOS/commit/c6894f2087ae151bb926b79fad9ad95f6a0b5f2b))
* guard against republishing, and move npm deprecate into CI ([2161003](https://github.com/edycutjong/BagOS/commit/2161003e00a8351b82948a9b57e238b9c9d91efc))
* submit server.json to the MCP registry via OIDC ([4bd8eb6](https://github.com/edycutjong/BagOS/commit/4bd8eb62666a5fe67d48a06edd0de21d4367ef66))

## [2.0.0] — 2026-08-15

### Fixed — the write tools never wrote

In 1.x, all three write tools built a transaction, discarded it, and reported
success. No transaction was ever signed or submitted. The keypair was read from
disk and used only to derive a public key.

| Tool | 1.x behaviour |
|---|---|
| `bags_execute_trade` | `createSwapTransaction()` result discarded; returned `"✅ Trade Execution Signed!"` regardless |
| `bags_claim_fees` | `getClaimTransactions()` result discarded; returned `"✅ Action execution signed successfully."` |
| `bags_launch_token` | Called only `createTokenInfoAndMetadata()`; `initialBuySOL` accepted and silently ignored; never launched anything |

If you used 1.x and believed a trade or claim executed, **it did not**. Check
your wallet history. No funds moved, in either direction.

This survived a 100%-coverage test suite because the SDK mocks returned shapes
the real SDK never produces (`createSwapTransaction` was mocked as resolving to
`{ signature }`). Mocks are now written against the SDK's `.d.ts` files.

### Fixed — mainnet was the silent default

`bags-client.ts` and `token-gate.ts` both fell back to
`https://api.mainnet-beta.solana.com` when `HELIUS_RPC_URL` was unset. An
unconfigured install pointed at mainnet.

### Fixed — key material could reach error messages

`wallet.ts` interpolated `JSON.parse` errors into the thrown message. V8 parse
errors can quote the offending input, which for a keypair file is the secret
key. Parse failures now produce a generic message.

### Fixed — the declared SDK floor was a version the code cannot run on

`package.json` required `@bagsfm/bags-sdk@^1.0.8`. That version ships only four
services — `tokenLaunch`, `state`, `config`, `fee`. It has no `trade` and no
`partner`, so three of the eight SDK calls this server makes do not exist there:

| Call | Present in 1.0.8? |
|---|---|
| `client.trade.getQuote` | no |
| `client.trade.createSwapTransaction` | no |
| `client.partner.getPartnerConfigClaimStats` | no |

Any install that resolved to the floor produced a server that crashed at runtime
on `bags_get_trade_quote`, `bags_execute_trade` and `bags_get_partner_stats` —
three of the ten tools, including the quote path both write tools depend on. The
lockfile masked it by resolving to 1.3.7.

The floor is now `^1.3.7`, the lowest version where all eight calls exist. Verified
against 1.4.2 as well: all eight survive with unchanged signatures.

Note for anyone widening this range again: 1.3.7 → 1.4.2 **removed** the
`incorporation` service and added `robinhood`. This SDK drops services in minor
bumps, so treat a caret range as something to re-verify, not something to trust.

### Fixed — the API key was echoed into tool output

`bags_authenticate` interpolated the freshly-issued Bags production API key
directly into its text response. MCP tool output is fed into the assistant's
context, so every successful authentication published a live `bags_prod_*`
credential into that context and into any transcript, log, or provider retention
downstream of it. The key was already being written to
`~/.config/bags/credentials.json`, so printing it bought nothing.

The response now shows the key ID, the save path, and a four-character tail
(`…ABCD — not printed in full`). A regression test asserts the full value never
appears in the response; treat a change there as a security change.

**If you ran `bags_authenticate` on any earlier build, rotate that key** at
[dev.bags.fm](https://dev.bags.fm) — assume the value is compromised.

### Added

- **Real execution path** (`lib/execute.ts`) — simulate → sign → send → confirm.
  Returns a confirmed signature and explorer link, or throws. Cannot report
  success for a transaction that did not land.
- **Spend caps** (`lib/guards.ts`) — `BAGS_MAX_SOL_PER_TX` (default 0.1) and
  `BAGS_MAX_SOL_PER_SESSION` (default 1.0), enforced before the SDK is called.
  The session counter increments only on confirmed transactions.
- **Two-step confirmation** — write tools return a preview and a single-use
  token fingerprinted to the exact arguments. Tokens expire after 5 minutes and
  are consumed on every outcome, so they cannot be replayed or reused against
  different arguments. Disable with `BAGS_ALLOW_UNCONFIRMED=true`; caps still apply.
- **Network/RPC agreement check** — the server refuses to start if the RPC
  endpoint's cluster disagrees with `BAGS_NETWORK`.
- **Startup configuration report** on stderr, with RPC credentials redacted.
- **`server.json`** — MCP registry manifest (schema `2025-12-11`).
- **`.github/SECURITY.md`** — threat model and key-handling policy.
- Structured tool errors (`toolError`) — no stack traces to the model; keypair
  byte arrays, long base58 strings, and long base64 blobs redacted.
- **Mainnet-only guard on writes.** The Bags SDK has no devnet deployment — one
  hardcoded API base URL and fixed mainnet program IDs. Write tools on devnet
  now return that explanation instead of failing at simulation with an opaque
  program-not-found.
- **Community health files** under `.github/`: code of conduct, contributing
  guide, security policy, issue templates, PR template.
- **CodeQL** (`security-extended`) and **gitleaks** (full-history secret scan)
  workflows, plus grouped monthly Dependabot with major bumps ignored.
- `docs/examples.md` — worked prompts with real expected output.

### Changed — breaking

- **`bags_launch_token` → `bags_prepare_token_metadata`.** The tool prepares
  metadata; it does not launch. A real launch requires a Meteora fee-share
  config whose fee-claimer split must be the user's decision, so it is left
  unimplemented rather than faked. The ignored `initialBuySOL` parameter is gone.
- **Writes require confirmation by default.** Existing automation that called
  `bags_execute_trade` or `bags_claim_fees` in one shot must either pass a
  confirmation token or set `BAGS_ALLOW_UNCONFIRMED=true`.
- **Default cluster is devnet.** Set `BAGS_NETWORK=mainnet` for the old behaviour.
- **Token-input swaps are refused by default.** The spend caps are
  SOL-denominated and cannot value an arbitrary token, so a swap whose input is
  not SOL would be entirely uncapped. Set `BAGS_ALLOW_UNCAPPED_TOKEN_SWAPS=true`
  to permit them; the confirmation preview then states that no cap applies.
  Previously such swaps passed every cap and displayed "Spend: 0 SOL".
- **Amounts convert using the mint's real decimals.** Both `bags_execute_trade`
  and `bags_get_trade_quote` previously used a hardcoded `1e9`, so a 6-decimal
  input mint (USDC and most pump-style tokens) traded and quoted 1000x the
  requested size.
- **Package renamed** from `@edycutjong/bagos-mcp-server` (GitHub Packages) to
  **`bagos-mcp-server` on public npm**. The official MCP registry accepts only
  `registry.npmjs.org`, and GitHub Packages requires auth to install even when
  public, so the repo's own publish target was unreachable by `npx`.
  Separately, an unscoped `bagos-mcp-server@1.0.0` was published to npmjs on
  2026-04-21 — the defective version described above. 2.0.0 superseded it on
  2026-08-15 and is what `npx bagos-mcp-server` now installs.
- `bags_execute_trade` drops the `side` parameter, which was declared but never
  read. `inputMint`/`outputMint` fully determine the direction.
- `.env` is now loaded from the working directory, not from a path relative to
  the installed package (which under `npx` resolved inside `node_modules`).

### Notes

- 212 tests. Bypass resistance for the caps and the confirmation step is covered
  explicitly and should be treated as non-negotiable in review. Verified by
  mutation: deleting the cap guard, the confirmation check, the decimals lookup,
  or the spend recorder each fails the suite.

## [1.0.0] — 2026-04-21

Initial release. See the note above before relying on any 1.x write operation.
