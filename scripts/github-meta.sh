#!/bin/bash
# Description: Updates the GitHub repository metadata (description, homepage, topics)

set -e

REPO="edycutjong/bagos"
DESC="The AI Operating System for Creator Finance — trade, claim, and launch tokens through natural language."
HOMEPAGE="https://dorahacks.io/buidl/43312"

echo "Updating GitHub repository metadata..."

gh repo edit "$REPO" \
  --description "$DESC" \
  --homepage "$HOMEPAGE" \
  --add-topic "solana" \
  --add-topic "defi" \
  --add-topic "mcp" \
  --add-topic "ai" \
  --add-topic "agent" \
  --add-topic "claude" \
  --add-topic "hackathon" \
  --add-topic "bags"

echo "✅ Successfully updated repository description, link, and topics!"
