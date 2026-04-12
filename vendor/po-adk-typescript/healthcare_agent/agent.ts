/**
 * Healthcare agent — ADK agent definition.
 *
 * TypeScript equivalent of healthcare_agent/agent.py.
 *
 * This agent connects to a patient's FHIR R4 server. FHIR credentials are
 * extracted from A2A message metadata before each LLM call by extractFhirContext()
 * and stored in session state, so tools can call the FHIR server without
 * credentials ever appearing in the LLM prompt.
 */

import '../shared/env.js';

import { LlmAgent } from '@google/adk';

import { extractFhirContext } from '../shared/fhirHook.js';
import {
    getPatientDemographics,
    getActiveMedications,
    getActiveConditions,
    getRecentObservations,
    getCarePlans,
    getCareTeam,
    getGoals,
} from '../shared/tools/index.js';

export const rootAgent = new LlmAgent({
    name: 'healthcare_agent',
    model: 'gemini-2.5-flash',
    description:
        'Healthcare agent — queries a patient\'s FHIR R4 record: demographics, medications, conditions, and observations.',
    instruction: `You are a clinical assistant with secure access to a patient's FHIR R4 record.
You can retrieve the following types of information:

  • Patient demographics (name, DOB, address, identifiers)
  • Active medications (including dosage and prescriber details)
  • Active medical conditions / diagnoses
  • Recent observations (vitals, labs)

Always use the available tools to fetch information from the FHIR server rather than
making assumptions. When data is returned, present it clearly and concisely for a
clinical audience.

If FHIR credentials are not available in the current session, tell the caller that
FHIR context must be provided in the request metadata.`,
    tools: [
        getPatientDemographics,
        getActiveMedications,
        getActiveConditions,
        getRecentObservations,
        getCarePlans,
        getCareTeam,
        getGoals,
    ],
    // extractFhirContext runs before every LLM call and moves FHIR credentials
    // from A2A message metadata into session state where tools can read them.
    beforeModelCallback: extractFhirContext,
});
