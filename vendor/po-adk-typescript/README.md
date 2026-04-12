# ── Prompt Opinion Agent Examples (TypeScript)
### Built with Google ADK · A2A Protocol · TypeScript

Runnable examples showing how to build external agents that connect to **[Prompt Opinion](https://promptopinion.ai)** — the multi-agent platform for healthcare and enterprise workflows.

This is the **TypeScript companion** to [po-adk-python](https://github.com/prompt-opinion/po-adk-python). It exposes the same three agents, the same A2A protocol endpoints, and the same FHIR credential flow — just written in TypeScript and runs on Node.js instead of Python/uvicorn.

---

## Contents

- [What's in this repo](#whats-in-this-repo)
- [Quick start](#quick-start)
- [The three agents](#the-three-agents)
- [The shared library](#the-shared-library)
- [Adding tools](#adding-tools)
- [FHIR context](#fhir-context-optional)
- [Configuration reference](#configuration-reference)
- [API security](#api-security)
- [Testing locally](#testing-locally)
- [ADK dev UI (adk web)](#adk-dev-ui-adk-web)
- [Running with Docker](#running-with-docker-local)
- [Deploying to Google Cloud Run](#deploying-to-google-cloud-run)
- [Connecting to Prompt Opinion](#connecting-to-prompt-opinion)

---

## What's in this repo

| Agent | Description | FHIR? | Port |
|---|---|---|---|
| `healthcare_agent` | Queries a patient's FHIR R4 record — demographics, meds, conditions, observations | ✅ Yes | 8001 |
| `general_agent` | Date/time queries and ICD-10-CM code lookups — no patient data needed | ❌ No | 8002 |
| `orchestrator` | Delegates to the other two agents using ADK's built-in sub-agent routing | ✅ Optional | 8003 |

All three share a `shared/` library that provides middleware, the FHIR context hook, FHIR R4 tools, and the A2A app factory — so each agent's own files stay small and focused.

---

## Architecture

```
Prompt Opinion
     │  POST /  X-API-Key  A2A JSON-RPC
     │
     ▼
┌──────────────────────────────────────────────────┐
│  shared/middleware.ts  (apiKeyMiddleware)         │
│  · validates X-API-Key                           │
│  · bridges FHIR metadata to A2A message metadata │
└──────────────┬───────────────────────────────────┘
               │
   ┌───────────┼───────────┐
   ▼           ▼           ▼
healthcare_  general_   orchestrator
agent        agent           │
   │           │          delegates
   │           │          via AgentTool
   ▼           ▼              │
shared/      local            ├──► healthcare_agent
fhirHook     tools/           └──► general_agent
   │          general.ts
   ▼
session state
(fhirUrl, fhirToken, patientId)
   │
   ▼
shared/tools/fhir.ts  ──►  FHIR R4 server
```

**Key design principle:** FHIR credentials travel in the A2A message metadata — they never appear in the LLM prompt. The `extractFhirContext` callback intercepts them before the model is called and stores them in session state, where tools read them at call time.

---

## Quick start

### Prerequisites

- Node.js 20 or later (`node --version`)
- A [Google AI Studio](https://aistudio.google.com/app/apikey) API key (free)
- Git

### 1 — Clone the repository

```bash
git clone https://github.com/your-org/po-adk-typescript.git
cd po-adk-typescript
```

### 2 — Install dependencies

```bash
npm install
```

### 3 — Configure environment variables

```bash
# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env
```

Open `.env` and set your Google API key:

```env
GOOGLE_API_KEY=your-google-api-key-here
```

### 4 — Run the agents

**Option A — All three at once (recommended for local development)**

```bash
npm run dev
```

All three agents start in a single terminal with colour-coded logs. Ports 8001, 8002, and 8003 are all live simultaneously.

**Or start them individually:**

```bash
# Terminal 1 — FHIR healthcare agent
npm run dev:healthcare

# Terminal 2 — General-purpose agent
npm run dev:general

# Terminal 3 — Orchestrator
npm run dev:orchestrator
```

> **Note:** The `dev:*` scripts use `tsx` to run TypeScript directly without a build step. For production use `npm run build` first, then `npm run start:*`. For the browser-based ADK dev UI use `npm run adk:web` — see [ADK dev UI](#adk-dev-ui-adk-web) below.

### 5 — Verify an agent is running

```bash
curl http://localhost:8001/.well-known/agent-card.json
curl http://localhost:8002/.well-known/agent-card.json
curl http://localhost:8003/.well-known/agent-card.json
```

You should see the agent card JSON describing the agent's capabilities and security requirements.

---

## The three agents

### `healthcare_agent` — FHIR-connected clinical assistant

The most complete example. Receives FHIR credentials from the caller via A2A metadata, extracts them into session state, and uses them to query a FHIR R4 server.

**Files to change when building your own:**

| File | What to change |
|---|---|
| `healthcare_agent/agent.ts` | Model, instruction, tools list |
| `healthcare_agent/server.ts` | Agent name, description, URL, FHIR extension URI |
| `shared/tools/fhir.ts` | Add or modify FHIR query tools |
| `shared/middleware.ts` | Update `VALID_API_KEYS` |

---

### `general_agent` — General-purpose assistant (no FHIR)

The minimal example. No `beforeModelCallback`, no FHIR tools.

Includes two tools that work offline with no external APIs:
- `getCurrentDatetime(timezone)` — current date/time in any IANA timezone
- `lookUpIcd10(term)` — ICD-10-CM code lookup from a built-in reference table

**Files to change when building your own:**

| File | What to change |
|---|---|
| `general_agent/agent.ts` | Model, instruction, tools list |
| `general_agent/server.ts` | Agent name, description, URL |
| `general_agent/tools/general.ts` | Replace with your own tools |

---

### `orchestrator` — Multi-agent orchestrator

Shows ADK's built-in sub-agent routing (`AgentTool`). Gemini decides which specialist to call based on the question.

---

## The shared library

```
shared/
├── env.ts            dotenv loader + GOOGLE_API_KEY → GOOGLE_GENAI_API_KEY alias
├── appFactory.ts     createA2aApp() — builds the A2A Express app for any agent
├── middleware.ts      apiKeyMiddleware() — API key enforcement
├── fhirHook.ts        extractFhirContext() — beforeModelCallback for FHIR
└── tools/
    ├── index.ts       re-exports all shared tools
    └── fhir.ts        FHIR R4 query tools
```

---

## Adding tools

Tools are created with `FunctionTool` from `@google/adk`. The `parameters` field takes a Zod schema that is converted to a JSON Schema for the model.

**Step 1** — Write the tool in `general_agent/tools/general.ts`:

```typescript
import { FunctionTool, ToolContext } from '@google/adk';
import { z } from 'zod/v3';

export const getCareTeam = new FunctionTool({
  name: 'getCareTeam',
  description: 'Returns the care team for the current patient.',
  parameters: z.object({}),
  execute: (_input: unknown, toolContext?: ToolContext) => {
    const patientId = toolContext?.state.get('patientId') ?? 'unknown';
    console.info(`tool_get_care_team patientId=${patientId}`);
    return { status: 'success', careTeam: [] };
  },
});
```

**Step 2** — Export it from `tools/index.ts` (if it belongs to shared tools):

```typescript
export { getCurrentDatetime, lookUpIcd10, getCareTeam } from './general.js';
```

**Step 3** — Register it in `agent.ts`:

```typescript
import { getCareTeam } from './tools/general.js';
export const rootAgent = new LlmAgent({ ..., tools: [..., getCareTeam] });
```

---

## FHIR context (optional)

FHIR context is **completely optional**. Agents that don't need it simply omit `beforeModelCallback` — `general_agent` is the example.

### How credentials flow

```
A2A request
  └── params.message.metadata
        └── "http://.../fhir-context": { fhirUrl, fhirToken, patientId }
              │
              ▼  shared/fhirHook.ts extractFhirContext() runs before every LLM call
              │
              ▼
        session state
              ├── fhirUrl   → toolContext.state['fhirUrl']
              ├── fhirToken → toolContext.state['fhirToken']
              └── patientId → toolContext.state['patientId']
```

---

## Configuration reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `GOOGLE_API_KEY` | **Yes** | — | Google AI Studio key for Gemini |
| `GOOGLE_GENAI_USE_VERTEXAI` | No | `FALSE` | Set to TRUE to use Vertex AI instead |
| `HEALTHCARE_AGENT_URL` | No | `http://localhost:8001` | Public URL for the healthcare agent |
| `GENERAL_AGENT_URL` | No | `http://localhost:8002` | Public URL for the general agent |
| `ORCHESTRATOR_URL` | No | `http://localhost:8003` | Public URL for the orchestrator |
| `API_KEY_PRIMARY` | No | `my-secret-key-123` | Primary API key for authenticated agents |
| `API_KEY_SECONDARY` | No | `another-valid-key` | Secondary API key |
| `FHIR_EXTENSION_URI` | No | — | Extension URI matching your Prompt Opinion workspace |

---

## API security

| Endpoint | `requireApiKey: true` | `requireApiKey: false` |
|---|---|---|
| `GET /.well-known/agent-card.json` | Open (always) | Open (always) |
| `POST /` | Requires `X-API-Key` | Open |

---

## Testing locally

```bash
# Start general_agent first (separate terminal or use npm run dev)
npm run dev:general

# Call the public general_agent (no key needed)
curl -X POST http://localhost:8002/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"message/send","params":{"message":{"role":"user","parts":[{"kind":"text","text":"What is the ICD-10 code for hypertension?"}]}}}'

# Check the healthcare agent card
curl http://localhost:8001/.well-known/agent-card.json

# Call the healthcare agent with an API key
curl -X POST http://localhost:8001/ \
  -H "Content-Type: application/json" \
  -H "X-API-Key: my-secret-key-123" \
  -d '{"jsonrpc":"2.0","id":"1","method":"message/send","params":{"message":{"role":"user","parts":[{"kind":"text","text":"What medications is this patient on?"}],"metadata":{"https://your-workspace.promptopinion.ai/schemas/a2a/v1/fhir-context":{"fhirUrl":"https://your-fhir-server.example.org/r4","fhirToken":"<token>","patientId":"patient-uuid"}}}}}'
```

---

## ADK dev UI (`adk web`)

The TypeScript ADK ships a browser-based dev UI for quickly chatting with an agent without a full A2A client. It is a **development/debugging tool only** — it bypasses Express and the A2A protocol entirely.

```bash
npm run adk:web   # builds TypeScript then opens the dev UI at http://localhost:8000
npm run adk:run   # builds TypeScript then opens a terminal chat interface
```

`adk web` discovers all three agents automatically from the compiled `dist/` folder and shows them in a dropdown.

> **Important — Python vs TypeScript `adk web`**
>
> If you have the Python ADK installed globally (via `pip install google-adk`), running `adk web` bare in your terminal will launch the **Python** version (using Uvicorn), which cannot load TypeScript agents. Always use `npm run adk:web` from this project to get the TypeScript version.

### What works in the dev UI

| Agent | Works in `adk web`? | Notes |
|---|---|---|
| `general_agent` | ✅ Fully | Date/time and ICD-10 tools work offline |
| `healthcare_agent` | ⚠️ Partial | Agent loads, but FHIR tools return "no context" — no A2A metadata to carry credentials |
| `orchestrator` | ⚠️ Partial | Routing works, but healthcare sub-agent hits the same FHIR context limitation |

For full end-to-end testing including FHIR context, use the A2A endpoints (`npm run dev`) with a real A2A client such as Prompt Opinion or the curl examples below.

---

## Running with Docker (local)

```bash
# First run: build and start all three agents
docker compose up --build

# Subsequent runs
docker compose up

# Stop all agents
docker compose down
```

Agents are available on `localhost:8001`, `localhost:8002`, `localhost:8003`.

---

## Deploying to Google Cloud Run

All three agents are built from the **same `Dockerfile`**. The `AGENT_MODULE` environment variable selects which agent to start.

```bash
# Deploy general_agent
gcloud run deploy general-agent \
  --source . \
  --region us-central1 \
  --set-env-vars "AGENT_MODULE=general_agent,GOOGLE_GENAI_USE_VERTEXAI=FALSE" \
  --set-secrets "GOOGLE_API_KEY=google-api-key:latest" \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 3
```

---

## Connecting to Prompt Opinion

1. Deploy your agent to a publicly reachable URL.
2. Set the public URL via `GENERAL_AGENT_URL` / `HEALTHCARE_AGENT_URL` / `ORCHESTRATOR_URL` env vars.
3. Update `FHIR_EXTENSION_URI` to match your Prompt Opinion workspace.
4. Register the agent in Prompt Opinion by providing the agent card URL:
   `https://your-agent.run.app/.well-known/agent-card.json`

---

## License

MIT

---

*Built on [Google ADK](https://google.github.io/adk-docs/) and the [A2A protocol](https://a2a-protocol.org/). Designed for the [Prompt Opinion](https://promptopinion.ai) multi-agent platform.*
