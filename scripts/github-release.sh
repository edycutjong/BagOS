#!/bin/bash
# Description: Creates a new GitHub release using the version from package.json

set -e

REPO="edycutjong/bagos"

# Move to project root to read package.json
cd "$(dirname "$0")/.."

# Extract version from package.json using node
VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"

echo "Creating GitHub release for $TAG..."

# Generate release notes automatically based on merged PRs
gh release create "$TAG" \
  --repo "$REPO" \
  --title "BagOS $TAG - Official BUIDL Release" \
  --generate-notes \
  --latest

echo "✅ Successfully created release $TAG!"
