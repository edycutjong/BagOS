#!/usr/bin/env bash
set -euo pipefail

# Build the MCPB bundle Smithery distributes for the stdio release type.
#
# Smithery has three release types: hosted (they run a JS module), external
# (they proxy to your URL), and stdio (this — a bundle the client downloads and
# runs locally). BagOS must use stdio: its write tools load a Solana keypair off
# the local filesystem (see src/lib/wallet.ts), so a server running on someone
# else's infrastructure cannot sign anything. Publishing the HTTP transport is
# separately ruled out by .github/SECURITY.md — /mcp has no auth.
#
# Layout note, load-bearing: src/index.ts reads ../package.json to report its
# version, so the bundle mirrors the npm layout exactly —
#   server/package.json + server/build/index.js
# Flattening the compiled output to server/index.js resolves ../package.json to
# the bundle root, where only manifest.json lives, and the server dies on start.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE="${ROOT}/.mcpb-stage"
OUT="${ROOT}/dist-mcpb"

cd "${ROOT}"

echo "==> checking manifest is in version lockstep"
PKG_V=$(node -p "require('./package.json').version")
MAN_V=$(node -p "require('./manifest.json').version")
if [ "${PKG_V}" != "${MAN_V}" ]; then
  echo "ERROR: package.json is ${PKG_V} but manifest.json is ${MAN_V}." >&2
  echo "       release-please keeps these in lockstep via extra-files in" >&2
  echo "       release-please-config.json. If they have drifted, that config broke." >&2
  exit 1
fi
echo "    both at ${PKG_V}"

echo "==> compiling"
npm run build >/dev/null

echo "==> staging"
rm -rf "${STAGE}" "${OUT}"
mkdir -p "${STAGE}/server/build" "${OUT}"
cp manifest.json "${STAGE}/manifest.json"
cp README.md LICENSE "${STAGE}/"
cp package.json "${STAGE}/server/package.json"

# Bundle to a single file rather than shipping node_modules.
#
# Smithery rejects anything over 25 MB. Copying the production dependency tree
# produced a 50 MB bundle (137 MB unpacked, 6,588 files) and the publish failed
# outright — the Solana and Bags SDK trees are simply that large. esbuild emits
# one ~5 MB file with the same behaviour and nothing to resolve at runtime.
#
# The createRequire banner is needed because the output is ESM but several
# transitive dependencies still call require() internally.
echo "==> bundling with esbuild (single file, no node_modules)"
npx -y esbuild@0.28.1 src/index.ts \
  --bundle --platform=node --format=esm --target=node22 \
  --outfile="${STAGE}/server/build/index.js" \
  --banner:js="import{createRequire as __cr}from'module';const require=__cr(import.meta.url);" \
  --log-level=warning

echo "==> smoke-testing the bundled entry point"
# Proves the ../package.json resolution above: flatten the layout and this dies.
#
# Two things this has to get right, both learned the hard way:
#
#   cwd, not just env. dotenv reads .env from the WORKING DIRECTORY, so `env -i`
#   alone does not isolate anything — run from the repo and the developer's real
#   .env loads, and a bundle missing its config looks perfectly healthy. Hence
#   the cd into an empty scratch directory.
#
#   No pipe into grep. Under `set -o pipefail`, `grep -q` exits at the first
#   match, node takes SIGPIPE, and the pipeline reports failure for a run that
#   actually succeeded. Capture first, match second.
SMOKE_DIR="$(mktemp -d)"
SMOKE_OUT="$(cd "${SMOKE_DIR}" && env -i \
  PATH="$(dirname "$(command -v node)"):/usr/bin:/bin" HOME="${SMOKE_DIR}" \
  BAGS_API_KEY=smoke-test \
  node "${STAGE}/server/build/index.js" </dev/null 2>&1 || true)"
rm -rf "${SMOKE_DIR}"

case "${SMOKE_OUT}" in
  *"BagOS MCP server"*) ;;
  *) echo "ERROR: the bundled entry point produced no preflight report:" >&2
     echo "${SMOKE_OUT}" >&2
     exit 1 ;;
esac
# An isolated run must see NOTHING but the injected key. If the bundle reports a
# keypair path or a gate mint, it picked up configuration that will not exist on
# a user's machine, and the smoke test is lying about what ships.
case "${SMOKE_OUT}" in
  *"[ok]   BAGS_KEYPAIR_PATH"*|*"[ok]   BOS_TOKEN_MINT"*)
     echo "ERROR: the bundled server read configuration from outside the bundle." >&2
     echo "${SMOKE_OUT}" >&2
     exit 1 ;;
esac
echo "    boots clean in an isolated environment"

echo "==> leak scan"
LEAKS=$(find "${STAGE}" \( -name '.env' -o -name '*.pem' -o -name 'credentials*.json' \
        -o -name 'keypair*.json' -o -name '.npmrc' -o -name '.DS_Store' \) \
        -not -path '*/node_modules/*' 2>/dev/null || true)
if [ -n "${LEAKS}" ]; then
  echo "ERROR: forbidden files staged into the bundle:" >&2
  echo "${LEAKS}" >&2
  exit 1
fi
if grep -rIlqE 'bags_(prod|live|dev)_[A-Za-z0-9]{8,}' "${STAGE}" --exclude-dir=node_modules 2>/dev/null; then
  echo "ERROR: something shaped like a live Bags API key is in the bundle." >&2
  exit 1
fi
echo "    clean"

echo "==> packing"
npx -y @anthropic-ai/mcpb@2.1.2 pack "${STAGE}" "${OUT}/bagos-${PKG_V}.mcpb"
npx -y @anthropic-ai/mcpb@2.1.2 validate "${STAGE}/manifest.json"

# Smithery's hard ceiling. Fail here, where the number and the fix are obvious,
# rather than after a CI run in `smithery mcp publish` with "Bundle exceeds
# 25 MB limit" and no indication of what grew.
LIMIT_MB=25
SIZE_B=$(wc -c < "${OUT}/bagos-${PKG_V}.mcpb" | tr -d ' ')
SIZE_MB=$(( SIZE_B / 1024 / 1024 ))
if [ "${SIZE_MB}" -ge "${LIMIT_MB}" ]; then
  echo "ERROR: bundle is ${SIZE_MB} MB; Smithery rejects anything at or over ${LIMIT_MB} MB." >&2
  echo "       Something is being bundled that should be external, or a dependency grew." >&2
  exit 1
fi
echo "    $(( SIZE_B / 1024 )) KB (limit ${LIMIT_MB} MB)"

rm -rf "${STAGE}"
echo
echo "Bundle: ${OUT}/bagos-${PKG_V}.mcpb"
echo "Publish with:"
echo "  npx -y @smithery/cli mcp publish ${OUT}/bagos-${PKG_V}.mcpb -n edycutjong/bagos"
