# ── Prompt Opinion ADK Agent — Cloud Run container ──────────────────────────────
#
# This single Dockerfile builds all three agents (healthcare_agent, general_agent,
# orchestrator) from the same image.  The AGENT_MODULE env var selects which one
# to start at runtime, so each Cloud Run service gets its own deployment with a
# different AGENT_MODULE value.
#
# Local build + test (replace MODULE as needed):
#   docker build -t adk-agents .
#   docker run --rm -p 8080:8080 \
#     -e AGENT_MODULE=general_agent.app:a2a_app \
#     -e GOOGLE_API_KEY=your-key-here \
#     -e GOOGLE_GENAI_USE_VERTEXAI=FALSE \
#     adk-agents
#
# Cloud Run deployment (see README — Deploying to Google Cloud Run):
#   gcloud run deploy healthcare-agent \
#     --source . \
#     --set-env-vars "AGENT_MODULE=healthcare_agent.app:a2a_app,GOOGLE_GENAI_USE_VERTEXAI=FALSE" \
#     --set-secrets "GOOGLE_API_KEY=google-api-key:latest" ...

FROM python:3.11-slim

WORKDIR /app

# Install Python dependencies first so this layer is cached between code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the full source tree — shared/, healthcare_agent/, general_agent/, orchestrator/.
COPY . .

# Cloud Run automatically sets PORT to 8080; override for local Docker testing.
ENV PORT=8080

# Which A2A agent to serve.  Set via --set-env-vars at deploy time.
# Valid values:
#   healthcare_agent.app:a2a_app   (authenticated, FHIR-connected — port 8001 locally)
#   general_agent.app:a2a_app      (public, no key required — port 8002 locally)
#   orchestrator.app:a2a_app       (authenticated, delegates to both — port 8003 locally)
ENV AGENT_MODULE=healthcare_agent.app:a2a_app

# exec replaces the shell so uvicorn is PID 1 and receives SIGTERM from Cloud Run.
CMD ["sh", "-c", "exec uvicorn ${AGENT_MODULE} --host 0.0.0.0 --port ${PORT}"]
