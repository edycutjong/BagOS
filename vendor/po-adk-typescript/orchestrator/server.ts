/**
 * Orchestrator — server entry point.
 *
 * Starts an Express server that implements the full A2A protocol:
 *
 *   GET  /.well-known/agent-card.json   Public — always open  ← KEY ENDPOINT
 *   POST /                              A2A JSON-RPC (requires X-API-Key)
 *
 * This is the TypeScript equivalent of orchestrator/__main__.py.
 *
 * Run:
 *   npm run dev:orchestrator
 *   # → Server live at http://localhost:8003
 *   # → Agent card: GET http://localhost:8003/.well-known/agent-card.json
 */

import 'dotenv/config';

import { createA2aApp } from '../shared/appFactory.js';
import { rootAgent } from './agent.js';

const PORT = Number(process.env['PORT'] ?? 8003);
const URL = process.env['ORCHESTRATOR_URL'] ?? `http://localhost:${PORT}`;

// Same FHIR extension URI as healthcare_agent — the orchestrator passes
// FHIR context through to the healthcare sub-agent.
const FHIR_EXTENSION = process.env['FHIR_EXTENSION_URI'] ?? 'http://localhost:5139/schemas/a2a/v1/fhir-context';

const app = createA2aApp({
    agent: rootAgent,
    name: 'orchestrator',
    description: (
        'A clinical orchestrator that routes questions to specialist sub-agents: ' +
        'healthcare_fhir_agent for patient record queries, ' +
        'general_agent for date/time and ICD-10 lookups.'
    ),
    url: URL,
    version: '1.0.0',
    fhirExtensionUri: FHIR_EXTENSION,
    requireApiKey: true,   // Authenticated — callers must send X-API-Key
});

app.listen(PORT, () => {
    console.info(`orchestrator running on port ${PORT}`);
    console.info(`Agent card: GET http://localhost:${PORT}/.well-known/agent-card.json`);
    console.info(`A2A endpoint: POST http://localhost:${PORT}/  (X-API-Key required)`);
});
