/**
 * A2A application factory — shared by all agents in this repo.
 *
 * TypeScript equivalent of shared/app_factory.py.
 *
 * Each agent's server.ts calls createA2aApp() with its name, description,
 * URL, and optional FHIR extension URI.  The factory:
 *   1. Builds the AgentCard (advertised at GET /.well-known/agent-card.json)
 *   2. Bridges the @google/adk Runner into the @a2a-js/sdk AgentExecutor
 *   3. Optionally attaches API key middleware
 *   4. Returns a configured Express app ready to call .listen() on
 *
 * Security modes
 * ──────────────
 *   requireApiKey: true  (default)
 *       Agent card advertises X-API-Key as required.
 *       POST / is blocked without a valid key from VALID_API_KEYS.
 *       GET /.well-known/agent-card.json is always public.
 *
 *   requireApiKey: false
 *       Agent card declares no security scheme.
 *       All requests pass through without authentication.
 *
 * Usage:
 *   import { createA2aApp } from '../shared/appFactory.js';
 *   import { rootAgent } from './agent.js';
 *
 *   const app = createA2aApp({
 *     agent: rootAgent,
 *     name: 'general_agent',
 *     description: 'Public utility agent.',
 *     url: process.env.GENERAL_AGENT_URL ?? 'http://localhost:8002',
 *     requireApiKey: false,
 *   });
 *   app.listen(8002);
 */

import './env.js';

import express, { Application, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

// @google/adk
import { LlmAgent, InMemorySessionService, Runner, isFinalResponse } from '@google/adk';

// @a2a-js/sdk — types
import { AgentCard, AGENT_CARD_PATH } from '@a2a-js/sdk';

// @a2a-js/sdk — server
import {
    AgentExecutor,
    RequestContext,
    ExecutionEventBus,
    DefaultRequestHandler,
    InMemoryTaskStore,
} from '@a2a-js/sdk/server';

// @a2a-js/sdk — express handlers
import {
    agentCardHandler,
    jsonRpcHandler,
    UserBuilder,
} from '@a2a-js/sdk/server/express';

import { apiKeyMiddleware } from './middleware.js';

// ── Options ────────────────────────────────────────────────────────────────────

export interface CreateA2aAppOptions {
    /** The ADK LlmAgent instance (rootAgent from agent.ts). */
    agent: LlmAgent;
    /** Agent name shown in the agent card and Prompt Opinion UI. */
    name: string;
    /** Short description of what this agent does. */
    description: string;
    /** Public base URL where this agent is reachable. e.g. http://localhost:8002 */
    url: string;
    /** Semver string. Defaults to "1.0.0". */
    version?: string;
    /**
     * If provided, advertises FHIR context support in the agent card.
     * Callers use this URI as the metadata key when sending FHIR credentials.
     * Omit for non-FHIR agents (e.g. general_agent).
     */
    fhirExtensionUri?: string;
    /**
     * If true (default), the agent card declares X-API-Key as required and
     * apiKeyMiddleware blocks requests without a valid key.
     * If false, no security scheme is declared and all requests are accepted.
     */
    requireApiKey?: boolean;
}

// ── ADK ↔ A2A bridge ──────────────────────────────────────────────────────────

/**
 * AdkAgentExecutor
 *
 * The @a2a-js/sdk calls execute() for every inbound A2A message.
 * We bridge it to the @google/adk Runner:
 *
 *   1. Extract user text from A2A message parts.
 *   2. Pass A2A message metadata (FHIR context, etc.) into RunConfig so the
 *      beforeModelCallback (fhirHook.ts) can read it from session state.
 *   3. Stream ADK Events, collect final model text.
 *   4. Publish one A2A Message reply and call eventBus.finished().
 */
class AdkAgentExecutor implements AgentExecutor {
    private readonly runner: Runner;

    constructor(agent: LlmAgent) {
        this.runner = new Runner({
            agent,
            appName: agent.name,
            sessionService: new InMemorySessionService(),
        });
    }

    async execute(
        requestContext: RequestContext,
        eventBus: ExecutionEventBus,
    ): Promise<void> {
        const { userMessage, contextId } = requestContext;

        // Extract plain text from all text parts in the A2A message.
        const userText = userMessage.parts
            .filter((p): p is { kind: 'text'; text: string } => p.kind === 'text')
            .map((p) => p.text)
            .join('\n');

        // Use contextId as session ID so conversation state persists across turns.
        const sessionId = contextId;

        // Ensure the session exists.
        const existing = await this.runner.sessionService.getSession({
            appName: this.runner.appName,
            userId: 'a2a-user',
            sessionId,
        });
        if (!existing) {
            await this.runner.sessionService.createSession({
                appName: this.runner.appName,
                userId: 'a2a-user',
                sessionId,
            });
        }

        // Bridge A2A message metadata (FHIR context) into ADK session state
        // via stateDelta — fhirHook.ts also does this in the callback, but
        // writing here ensures the values are available from the very first
        // tool call even before beforeModelCallback fires.
        // We write BOTH camelCase and snake_case keys for compatibility.
        const a2aMetadata = (userMessage.metadata ?? {}) as Record<string, unknown>;
        const stateDelta: Record<string, unknown> = { a2aMetadata };

        for (const [key, value] of Object.entries(a2aMetadata)) {
            if (key.includes('fhir-context') && value && typeof value === 'object') {
                const fhir = value as Record<string, string>;
                // camelCase — TypeScript convention
                if (fhir['fhirUrl']) { stateDelta['fhirUrl'] = fhir['fhirUrl']; stateDelta['fhir_url'] = fhir['fhirUrl']; }
                if (fhir['fhirToken']) { stateDelta['fhirToken'] = fhir['fhirToken']; stateDelta['fhir_token'] = fhir['fhirToken']; }
                if (fhir['patientId']) { stateDelta['patientId'] = fhir['patientId']; stateDelta['patient_id'] = fhir['patientId']; }
            }
        }

        // Run the ADK agent and collect the final text response.
        const eventStream = this.runner.runAsync({
            userId: 'a2a-user',
            sessionId,
            newMessage: {
                role: 'user',
                parts: [{ text: userText }],
            },
            stateDelta,
        });

        let agentText = '';
        for await (const event of eventStream) {
            // isFinalResponse() returns true on the last model event after all
            // tool calls have been resolved — this is the text we want to return.
            if (isFinalResponse(event) && event.content?.role === 'model') {
                for (const part of event.content.parts ?? []) {
                    if ('text' in part && typeof part.text === 'string') {
                        agentText += part.text;
                    }
                }
            }
        }

        // Publish the agent reply back to the A2A caller.
        eventBus.publish({
            kind: 'message',
            messageId: uuidv4(),
            role: 'agent',
            parts: [{ kind: 'text', text: agentText || '(no response)' }],
            contextId,
        });

        eventBus.finished();
    }

    // Not needed for non-streaming agents; required by the interface.
    cancelTask = async (): Promise<void> => { };
}

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * createA2aApp
 *
 * Builds and returns a fully configured Express application that implements
 * the A2A protocol for the given ADK agent.
 *
 * Routes mounted:
 *   GET  /.well-known/agent-card.json   Always public — returns AgentCard JSON
 *   POST /                              A2A JSON-RPC (message/send, tasks/get…)
 */
export function createA2aApp(options: CreateA2aAppOptions): Application {
    const {
        agent,
        name,
        description,
        url,
        version = '1.0.0',
        fhirExtensionUri,
        requireApiKey = true,
    } = options;

    // ── Build AgentCard ──────────────────────────────────────────────────────────

    // FHIR extension — only included when the agent supports FHIR context.
    const extensions = fhirExtensionUri
        ? [
            {
                uri: fhirExtensionUri,
                description:
                    "FHIR R4 context — allows the agent to query the patient's FHIR server.",
                required: false,
            },
        ]
        : [];

    // Security scheme advertised in the agent card.
    const securitySchemes = requireApiKey
        ? {
            apiKey: {
                type: 'apiKey' as const,
                name: 'X-API-Key',
                in: 'header' as const,
                description: 'API key required to access this agent.',
            },
        }
        : undefined;

    const security = requireApiKey ? [{ apiKey: [] as string[] }] : undefined;

    const agentCard: AgentCard = {
        name,
        description,
        url,
        version,
        protocolVersion: '0.3.0',
        // Required by Prompt Opinion and the A2A spec — declares the transport
        // this agent's main URL accepts. 'JSONRPC' means HTTP POST + JSON-RPC 2.0,
        // which is what @a2a-js/sdk's jsonRpcHandler implements.
        preferredTransport: 'JSONRPC',
        defaultInputModes: ['text/plain'],
        defaultOutputModes: ['text/plain'],
        capabilities: {
            streaming: false,
            pushNotifications: false,
            stateTransitionHistory: true,
            extensions,
        },
        skills: [],
        ...(securitySchemes && { securitySchemes }),
        ...(security && { security }),
    };

    // ── Wire up A2A SDK ──────────────────────────────────────────────────────────

    const agentExecutor = new AdkAgentExecutor(agent);

    const requestHandler = new DefaultRequestHandler(
        agentCard,
        new InMemoryTaskStore(),
        agentExecutor,
    );

    // ── Build Express app ────────────────────────────────────────────────────────

    const app = express();
    app.use(express.json({ limit: '50mb' }));

    // 1. GET /.well-known/agent-card.json — ALWAYS public.
    //    This is the first thing any caller (including Prompt Opinion) fetches
    //    to discover the agent and learn whether authentication is required.
    app.use(
        `/${AGENT_CARD_PATH}`,
        agentCardHandler({ agentCardProvider: requestHandler }),
    );

    // 2. API key enforcement for the JSON-RPC endpoint (POST /).
    if (requireApiKey) {
        app.use('/', (req: Request, res: Response, next: NextFunction) => {
            apiKeyMiddleware(req, res, next);
        });
    }

    // 3. POST / — A2A JSON-RPC handler (message/send, message/stream, tasks/get…)
    //
    // UserBuilder.fromHeader() does not exist in @a2a-js/sdk v0.3.x.
    // Security is enforced by apiKeyMiddleware above — unauthenticated requests
    // are already rejected before this handler runs, so noAuthentication is fine.
    const authBuilder = UserBuilder.noAuthentication;

    app.use(
        '/',
        jsonRpcHandler({
            requestHandler,
            userBuilder: authBuilder,
        }),
    );

    return app;
}
