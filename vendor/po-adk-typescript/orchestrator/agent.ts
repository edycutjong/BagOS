/**
 * Orchestrator — ADK agent definition.
 *
 * TypeScript equivalent of orchestrator/agent.py.
 *
 * The orchestrator delegates to specialist sub-agents using ADK's AgentTool.
 * Gemini decides which sub-agent to call based on the question — the
 * orchestrator itself has no tools beyond the two AgentTools.
 *
 * Note: The sub-agents must be running on their own ports when the orchestrator
 * is used in production. For local testing you can import them directly via
 * AgentTool rather than connecting over HTTP.
 */

import '../shared/env.js';

import { LlmAgent, AgentTool } from '@google/adk';

import { extractFhirContext } from '../shared/fhirHook.js';
import { rootAgent as healthcareAgent } from '../healthcare_agent/agent.js';
import { rootAgent as generalAgent } from '../general_agent/agent.js';

const healthcareTool = new AgentTool({ agent: healthcareAgent });
const generalTool = new AgentTool({ agent: generalAgent });

export const rootAgent = new LlmAgent({
    name: 'orchestrator',
    model: 'gemini-2.5-flash',
    description:
        'Orchestrator agent — routes requests to the appropriate specialist: healthcare or general.',
    instruction: `You are an orchestrating assistant that routes questions to the right specialist.

You have access to two specialist agents:

  1. healthcare_agent — use this for anything related to a specific patient's clinical data:
     demographics, medications, conditions, or recent observations.
     This agent requires FHIR credentials to be present in the session.

  2. general_agent — use this for general utility questions:
     date/time queries and ICD-10-CM code lookups.
     This agent works without any patient context.

Decide which specialist to call based on the user's request. If the question is clinical
and patient-specific, use healthcare_agent. If it's a general query, use general_agent.

Summarise the specialist's response clearly for the user.`,
    tools: [healthcareTool, generalTool],
    // Pass FHIR context through to sub-agents that need it.
    beforeModelCallback: extractFhirContext,
});
