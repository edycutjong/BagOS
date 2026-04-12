/**
 * General agent — server entry point.
 *
 * Starts an Express server that implements the full A2A protocol:
 *
 *   GET  /.well-known/agent-card.json   Public — always open  ← KEY ENDPOINT
 *   POST /                              A2A JSON-RPC (no auth required here)
 *
 * This is the TypeScript equivalent of general_agent/__main__.py.
 *
 * Run:
 *   npm run dev:general
 *   # → Server live at http://localhost:8002
 *   # → Agent card: GET http://localhost:8002/.well-known/agent-card.json
 */

import 'dotenv/config';

import { createA2aApp } from '../shared/appFactory.js';
import { rootAgent } from './agent.js';

const PORT = Number(process.env['PORT'] ?? 8002);
const URL = process.env['GENERAL_AGENT_URL'] ?? `http://localhost:${PORT}`;

const app = createA2aApp({
    agent: rootAgent,
    name: 'General Agent',
    description: 'General utility agent — date/time queries and ICD-10-CM code lookups.',
    url: URL,
    version: '1.0.0',
    requireApiKey: false,   // This agent is intentionally public
});

app.listen(PORT, () => {
    console.info(`general_agent running on port ${PORT}`);
    console.info(`Agent card: GET http://localhost:${PORT}/.well-known/agent-card.json`);
    console.info(`A2A endpoint: POST http://localhost:${PORT}/`);
});
