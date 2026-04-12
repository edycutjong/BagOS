/**
 * General agent — ADK agent definition.
 *
 * TypeScript equivalent of general_agent/agent.py.
 *
 * This is a public agent (requireApiKey: false) for general utility queries:
 *   • Current date/time in any timezone
 *   • ICD-10-CM code lookups
 *
 * No FHIR context, no beforeModelCallback — the simplest possible example.
 */

import '../shared/env.js';

import { LlmAgent } from '@google/adk';
import { getCurrentDatetime, lookUpIcd10 } from './tools/general.js';

export const rootAgent = new LlmAgent({
    name: 'general_agent',
    model: 'gemini-2.5-flash',
    description:
        'General utility agent — provides current date/time and ICD-10-CM code lookups.',
    instruction: `You are a helpful medical assistant with access to date/time information
and an ICD-10-CM coding reference.

When the user asks for the current date or time, always call the getCurrentDatetime tool
with the appropriate timezone. Default to UTC if no timezone is specified.

When the user asks about ICD-10. diagnostic codes, or medical coding, call the lookUpIcd10
tool with the clinical term they provide.

Be concise and accurate. Always use the tools for date/time and ICD code queries rather
than relying on your training data.`,
    tools: [getCurrentDatetime, lookUpIcd10],
});
