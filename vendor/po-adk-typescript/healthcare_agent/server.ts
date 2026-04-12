/**
 * Healthcare agent — server entry point.
 *
 * Starts an Express server that implements the full A2A protocol:
 *
 *   GET  /.well-known/agent-card.json   Public — always open  ← KEY ENDPOINT
 *   POST /                              A2A JSON-RPC (requires X-API-Key)
 *
 * This is the TypeScript equivalent of healthcare_agent/__main__.py.
 *
 * Run:
 *   npm run dev:healthcare
 *   # → Server live at http://localhost:8001
 *   # → Agent card: GET http://localhost:8001/.well-known/agent-card.json
 */

import 'dotenv/config';

import { createA2aApp } from '../shared/appFactory.js';
import { rootAgent } from './agent.js';

const PORT = Number(process.env['PORT'] ?? 8001);
const URL = process.env['HEALTHCARE_AGENT_URL'] ?? `http://localhost:${PORT}`;

// Match the Python default: http://localhost:5139/schemas/a2a/v1/fhir-context
// This is the Prompt Opinion local API URL — the extension key under which
// Prompt Opinion sends FHIR credentials in A2A message metadata.
// Override with FHIR_EXTENSION_URI env var for non-local deployments.
const FHIR_EXTENSION = process.env['FHIR_EXTENSION_URI'] ?? 'http://localhost:5139/schemas/a2a/v1/fhir-context';

const app = createA2aApp({
    agent: rootAgent,
    name: 'healthcare_fhir_agent',
    description: (
        "A clinical assistant that queries a patient's FHIR health record to answer " +
        'questions about demographics, active medications, conditions, and observations.'
    ),
    url: URL,
    version: '1.0.0',
    fhirExtensionUri: FHIR_EXTENSION,
    requireApiKey: true,   // Authenticated — callers must send X-API-Key
});

app.listen(PORT, () => {
    console.info(`healthcare_agent running on port ${PORT}`);
    console.info(`Agent card: GET http://localhost:${PORT}/.well-known/agent-card.json`);
    console.info(`A2A endpoint: POST http://localhost:${PORT}/  (X-API-Key required)`);
});
