# Known issues

Things that are wrong, why they are still wrong, and what has already been ruled
out — so the next person (probably future-me) does not re-derive it.

Last verified: 2026-08-16.

---

## 1. release-please does not cut the release — the workflow does it instead

**Status: mitigated, root cause still open.** Releases complete unattended; the
underlying bug is unexplained. Both statements matter, so both are below.

**Symptom.** A release PR merges cleanly, the version files land on `main`, and
release-please creates no GitHub Release. The workflow is **green**. Every later
run then logs:

```
⚠ No latest release pull request found.
❯ Found pull request #14: 'chore: release main'
⚠ There are untagged, merged release PRs outstanding - aborting
```

and exits **0**. Nothing is released and nothing looks broken.

**Blast radius before mitigation.** It jammed silently from 2026-05 to 2026-08:
23 commits sat unreleased for three weeks with a green checkmark on every run.
npm, the MCP registry, GitHub Packages and Smithery all served a stale version
the whole time.

### Mitigation — the pipeline recovers on its own

`.github/workflows/release-please.yml` runs an `Unjam the release label handoff`
step with `if: always()`. It:

- **cuts the release itself** when release-please declines to — the manifest
  version, on the merge commit of the PR that bumped it, with that version's
  changelog section as the notes;
- relabels the PR `autorelease: tagged`, which is what unjams the next run;
- sets `unjam_created`, which the `publish` and `registry` jobs accept alongside
  release-please's own `release_created`. Without that they gate on
  `release_created` alone — false in exactly the case the fallback exists for.
  That gap shipped once: v2.5.0 was tagged while npm and the registry stayed on
  2.4.1, every surface advertising a version that was never published.

Verified end to end on **v2.5.1** (2026-08-16): merging the release PR produced
the tag, the Release, the npm publish and the registry submission with no manual
step. release-please itself still declines — the run logs `release-please did not
cut v2.5.1 for PR #16 — creating it here`.

### Root cause: not established

`gh release create` returns:

```
HTTP 403: Resource not accessible by integration
POST /repos/edycutjong/BagOS/releases
```

…while the job's own startup log prints `Contents: write`. The token has the
permission the API documents, and the API refuses anyway.

**Ruled out** (each checked, not assumed) — do not spend time re-testing these:

| Hypothesis | Result |
|---|---|
| Missing `issues: write` for the label handoff | Added. Same failure. |
| Repo default workflow permissions set to `read` | Was `read`, set to `write`. Same failure; log shows `Contents: write`. |
| Job-level `permissions:` override on the release-please job | None exists. |
| Repository rulesets | None configured. |
| Tag protection rules | None configured. |
| Immutable releases | `immutable_releases: null`. |
| Tag already exists (would be 422 anyway) | It did not. |
| Squash vs merge commit | v2.1.0 and v2.2.0 released fine from squash merges. |

One confounder was self-inflicted and is recorded so the log is readable: setting
the default workflow permission also flipped *"Allow GitHub Actions to create and
approve pull requests"* off, which broke PR creation for a while and muddied the
signal. Restored.

The machinery **did** work once: #10 → v2.1.0 and #11 → v2.2.0 released
automatically. It broke after #11's `autorelease: pending` label was never
flipped, and one missed label write jams every later run permanently.

### Manual recovery

No longer routine — the fallback handles it. If the fallback is ever prevented
from running, this is the equivalent by hand:

```bash
V=$(jq -r '.["."]' .release-please-manifest.json)
SHA=$(gh pr view <PR> --json mergeCommit --jq '.mergeCommit.oid')
awk -v v="## [$V]" 'index($0,v)==1 {f=1;print;next} f && /^## \[/ {exit} f {print}' \
  CHANGELOG.md > /tmp/notes.md
git tag -a "v$V" "$SHA" -m "v$V" && git push origin "v$V"
gh release create "v$V" --verify-tag --title "v$V" --notes-file /tmp/notes.md
gh pr edit <PR> --add-label 'autorelease: tagged' --remove-label 'autorelease: pending'
gh workflow run publish.yml && gh workflow run registry.yml
```

**A PAT is not the answer here.** The standard workaround is a token with
`contents: write` passed to the action via `token:`. Deliberately not done: this
repo's argument is about not holding credentials it does not need, and with the
fallback in place it would save nothing — releases already complete unattended.

---

### 2026-08-16 — version drift check: none

`npm view bagos-mcp-server version`, `package.json`, `server.json` and
`.release-please-manifest.json` all report **2.5.1**, and the tag `v2.5.1`
exists. No drift; the pipeline is not jammed.

---

## 2. Dependabot: 6 high advisories from `bigint-buffer`

**Alert:** [GHSA-3gc7-fjrx-p6mg](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg).

Six advisories, **one** root cause, counted once at each level of the chain it
travels up:

```
bigint-buffer → @solana/buffer-layout-utils → @solana/spl-token
              → @meteora-ag/* → @bagsfm/bags-sdk
```

**No patched version exists.** `1.1.5` is simultaneously the installed version,
the latest published version, and vulnerable. `npm audit fix --force` "resolves"
it by downgrading `@bagsfm/bags-sdk` to 1.0.8 — a version with no `trade` and no
`partner` service, i.e. a build that crashes on three of our tools — and
`@solana/web3.js` to 0.0.3.

**Mitigation.** CI runs a ratchet rather than a flat gate: any **critical** fails,
and any count rising above `.audit-baseline.json` fails. Upstream's existing debt
does not block us; new debt does. When upstream ships a fix, lower the baseline.

**Caveat that matters for consumers:** npm honours `overrides` only in a root
project, so the version-scoped overrides in `package.json` protect this repo and
CI but **not** installers of the published package. Fixing that properly needs
the Bags SDK to unpin its own transitive deps.

---

## 3. The Smithery quality score is capped near 60 for any stdio server

Smithery's Capability Quality block (40 of 100 points) reads a `tools` array that
an `.mcpb` bundle cannot legally carry:

| Validator | Rule for `tools[]` |
|---|---|
| `@anthropic-ai/mcpb`, manifest schema **v0.1–v0.4** | `{name, description}` only, `additionalProperties: false` |
| `@smithery/cli` publish payload | `inputSchema` **required** |

`{name, description}` packs but will not publish (400, `expected object, received
undefined`, once per tool); adding `inputSchema` publishes but will not pack
(`Unrecognized key(s)`). Upgrading does not help — 2.1.2 is latest and all four
schema versions agree.

Tracked upstream at
[smithery-cli#787](https://github.com/arcadeai-labs/smithery-cli/issues/787).

The other route — hosting the server so Smithery can scan it — is refused on
purpose: `--http` serves `/mcp` unauthenticated with one shared spend counter, so
hosting means publishing an unauthenticated mainnet spending endpoint. See
[SECURITY.md](../.github/SECURITY.md). 40 points is not worth that.

---

## 4. The Smithery badge endpoint returns 500

`https://smithery.ai/badge/<namespace>` returns HTTP 500 with a zero-byte body
for **every** server, not just this one — verified against
`upstash/context7-mcp` and `smithery-ai/github`. The README therefore uses a
shields badge pointing at the same `/servers/` URL. Swap back if it recovers.
