# Known issues

Things that are wrong, why they are still wrong, and what has already been ruled
out — so the next person (probably future-me) does not re-derive it.

Last verified: 2026-08-16.

---

## 1. release-please does not cut the release; it has to be tagged by hand

**Symptom.** A release PR merges cleanly, the version files land on `main`, and no
GitHub Release appears. The workflow is **green**. Every later run then logs:

```
⚠ No latest release pull request found.
❯ commits: 159
❯ Found pull request #14: 'chore: release main'
⚠ There are untagged, merged release PRs outstanding - aborting
```

and exits **0**. Nothing is released, and nothing looks broken.

**Blast radius.** This jammed silently from 2026-05 to 2026-08: 23 commits sat
unreleased for three weeks with a green checkmark on every run. npm, the MCP
registry, GitHub Packages and Smithery all served a stale version the whole time.

**Root cause: not established.** `gh release create` returns:

```
HTTP 403: Resource not accessible by integration
POST /repos/edycutjong/BagOS/releases
```

…while the job's own startup log prints `Contents: write`. The token has the
permission the API says it needs, and the API refuses anyway.

**Ruled out** (each checked, not assumed):

| Hypothesis | Result |
|---|---|
| Missing `issues: write` for the label handoff | Added. Same failure. |
| Repo default workflow permissions set to `read` | Was `read`, set to `write`. Same failure. |
| Job-level `permissions:` override on the release-please job | None exists. |
| Repository rulesets | None configured. |
| Tag protection rules | None configured. |
| Immutable releases | `immutable_releases: null`. |
| Tag already exists (would be 422 anyway) | It did not. |
| Squash vs merge commit | v2.1.0 and v2.2.0 released fine from squash merges. |

Worth noting the machinery **did** work: #10 → v2.1.0 and #11 → v2.2.0 both
released automatically. It broke after #11's `autorelease: pending` label was
never flipped to `tagged`, and one missed label write jams every later run
permanently.

**Current mitigation.** `.github/workflows/release-please.yml` has an
`Unjam the release label handoff` step that runs with `if: always()`. It:

- relabels any merged release PR left `pending` whose version **is** tagged —
  this is the write release-please should have made, and it is what unjams the
  next run;
- attempts to create the release itself when the version is **not** tagged
  (currently 403s, see above);
- **fails the run** rather than exiting 0, so the jam is never silent again.

**Manual recovery** when a release PR merges and no release appears:

```bash
V=$(jq -r '.["."]' .release-please-manifest.json)
SHA=$(gh pr view <PR> --json mergeCommit --jq '.mergeCommit.oid')
awk -v v="## [$V]" 'index($0,v)==1 {f=1;print;next} f && /^## \[/ {exit} f {print}' \
  CHANGELOG.md > /tmp/notes.md
git tag -a "v$V" "$SHA" -m "v$V" && git push origin "v$V"
gh release create "v$V" --verify-tag --title "v$V" --notes-file /tmp/notes.md
gh pr edit <PR> --add-label 'autorelease: tagged' --remove-label 'autorelease: pending'
```

Creating the release fires `publish`, `registry`, `smithery` and `publish-ghp`
normally — only the tag/release step needs a human.

**If you want it actually fixed:** the standard workaround is a PAT with
`contents: write` stored as a secret and passed to the action via `token:`. That
was deliberately **not** done — this repo's whole argument is about not holding
credentials it does not need, and a long-lived org-scoped token to save one
command per release is a bad trade. Revisit if release frequency increases.

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
