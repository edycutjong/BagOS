# ── Prompt Opinion ADK Agent (TypeScript) — Cloud Run container ──────────────
#
# This single Dockerfile builds all three agents from the same image.
# The AGENT_MODULE env var selects which agent to start at runtime.
#
# Local build + test:
#   docker build -t po-adk-ts .
#   docker run --rm -p 8080:8080 \
#     -e AGENT_MODULE=general_agent \
#     -e GOOGLE_API_KEY=your-key-here \
#     -e GOOGLE_GENAI_USE_VERTEXAI=FALSE \
#     po-adk-ts
#
# Cloud Run deployment:
#   gcloud run deploy general-agent \
#     --source . \
#     --set-env-vars "AGENT_MODULE=general_agent,GOOGLE_GENAI_USE_VERTEXAI=FALSE" \
#     --set-secrets "GOOGLE_API_KEY=google-api-key:latest" ...

FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies first — cached layer unless package.json changes
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Production image ──────────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Only copy production deps and compiled output
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Cloud Run sets PORT=8080; default to 8080 for local Docker testing.
ENV PORT=8080

# Which agent to serve:
#   general_agent      → dist/general_agent/server.js     (public, no key)
#   healthcare_agent   → dist/healthcare_agent/server.js  (X-API-Key required)
#   orchestrator       → dist/orchestrator/server.js      (X-API-Key required)
ENV AGENT_MODULE=general_agent

CMD ["sh", "-c", "node dist/${AGENT_MODULE}/server.js"]
