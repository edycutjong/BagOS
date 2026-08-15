# BagOS — GitHub Packages mirror

> **Install from npm, not from here.**
>
> ```bash
> npx -y bagos-mcp-server
> ```
>
> <https://www.npmjs.com/package/bagos-mcp-server>

This package is a **mirror**. It exists so this repository's Packages tab shows
the current release instead of a stale one. Everything is published to public
npm first, and that is what every install path in the documentation points to.

## Why npm is the real target

**GitHub Packages requires authentication to install — even when the package is
public.** A stranger running `npx @edycutjong/bagos-mcp-server` gets a 401. That
alone disqualifies it as the primary channel for a tool whose entire install
story is one `npx` command.

**The official MCP registry accepts only `registry.npmjs.org`** as an npm base
URL. BagOS is listed there as `io.github.edycutjong/bagos`, and that listing is
cross-checked against the npm tarball.

Both reasons are recorded in `CHANGELOG.md` under 2.0.0, when the publish target
moved from GitHub Packages to public npm.

## What you lose by installing from here

- **npm provenance.** The npm build is published from CI with a SLSA attestation
  cryptographically tying the tarball to this repository and the exact commit
  that built it. Verify it:
  <https://www.npmjs.com/package/bagos-mcp-server#provenance>
- **A working `npx`,** per the auth requirement above.

## What BagOS is

An MCP server for [Bags](https://bags.fm) on Solana. Read tools cover token
analytics, creator-fee rosters, claim audit trails and trade quotes. The two
write tools execute swaps and claim creator fees — but the first call to either
**signs nothing**: it returns a preview and a single-use confirmation token
fingerprinted to the exact arguments, so a token issued for a 0.01 SOL swap
cannot authorize a 10 SOL one.

Every write passes: token gate → spend caps → confirmation → simulate → sign →
send → confirm. Hard defaults of 0.1 SOL per transaction and 1 SOL per session.
Writes are off unless configured and are mainnet-only; the server defaults to
devnet so an unconfigured install cannot spend real money.

- **Source, docs and security policy:** <https://github.com/edycutjong/BagOS>
- **Site:** <https://bagos.edycu.dev>
- **MCP registry:** `io.github.edycutjong/bagos`

MIT.
