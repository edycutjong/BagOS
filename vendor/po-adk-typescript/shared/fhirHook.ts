/**
 * FHIR context hook — ADK beforeModelCallback.
 *
 * TypeScript equivalent of shared/fhir_hook.py.
 *
 * Reads FHIR credentials from ADK session state (set by stateDelta in
 * appFactory.ts) and writes them into both camelCase AND snake_case keys
 * so this code is compatible with any tools that use either convention.
 *
 * State key convention (both sets are written):
 *   camelCase : fhirUrl  / fhirToken  / patientId   (TypeScript-style)
 *   snake_case: fhir_url / fhir_token / patient_id  (Python-style)
 *
 * appFactory.ts flattens the FHIR fields from the A2A message metadata into
 * stateDelta using camelCase keys.  This hook then also writes the snake_case
 * aliases so the FHIR tools can use either name.
 *
 * Metadata key convention (must match the AgentExtension URI in server.ts):
 *   "http://<host>/schemas/a2a/v1/fhir-context": {
 *     "fhirUrl":   "https://fhir.example.org",
 *     "fhirToken": "<bearer-token>",
 *     "patientId": "patient-42"
 *   }
 */

import type { CallbackContext, LlmRequest } from '@google/adk';

const FHIR_CONTEXT_KEY_SUFFIX = 'fhir-context';

function tryParseObject(value: unknown): Record<string, string> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, string>;
    }
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value) as unknown;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, string>;
            }
        } catch { /* not JSON */ }
    }
    return null;
}

function scanMetadataForFhir(
    meta: Record<string, unknown>,
): Record<string, string> | null {
    for (const [key, value] of Object.entries(meta)) {
        if (key.includes(FHIR_CONTEXT_KEY_SUFFIX)) return tryParseObject(value);
    }
    return null;
}

/**
 * Write FHIR credentials into session state under both camelCase and
 * snake_case keys so both TypeScript tools and any Python-style tools work.
 */
function writeFhirState(
    state: CallbackContext['state'],
    fhirUrl: string,
    fhirToken: string,
    patientId: string,
): void {
    // camelCase (TypeScript convention)
    state.set('fhirUrl', fhirUrl);
    state.set('fhirToken', fhirToken);
    state.set('patientId', patientId);
    // snake_case (Python convention — also accepted by fhir.ts tools)
    state.set('fhir_url', fhirUrl);
    state.set('fhir_token', fhirToken);
    state.set('patient_id', patientId);
}

/**
 * extractFhirContext
 *
 * ADK beforeModelCallback — called before every LLM invocation.
 * Signature: ({ context, request }) as required by SingleBeforeModelCallback.
 *
 * Fast path: reads credentials set by appFactory.ts's stateDelta (camelCase).
 * Fallback: scans raw a2aMetadata object in session state.
 *
 * Returns undefined — does not modify the LLM request.
 *
 * Log markers:
 *   hook_called_fhir_found          Fast path — flat keys already in state
 *   hook_called_fhir_from_metadata  Fetched from raw a2aMetadata object
 *   hook_called_no_fhir_context     No FHIR credentials found anywhere
 */
export function extractFhirContext({
    context: callbackContext,
}: {
    context: CallbackContext;
    request: LlmRequest;
}): undefined {
    // Fast path — appFactory wrote camelCase keys directly via stateDelta.
    const fhirUrl = (callbackContext.state.get('fhirUrl') ?? callbackContext.state.get('fhir_url')) as string | undefined;
    const fhirToken = (callbackContext.state.get('fhirToken') ?? callbackContext.state.get('fhir_token')) as string | undefined;
    const patientId = (callbackContext.state.get('patientId') ?? callbackContext.state.get('patient_id')) as string | undefined;

    if (fhirUrl && fhirToken && patientId) {
        writeFhirState(callbackContext.state, fhirUrl, fhirToken, patientId);
        console.info(`FHIR_URL_FOUND value=${fhirUrl}`);
        console.info(`FHIR_TOKEN_FOUND fingerprint=len=${fhirToken.length}`);
        console.info(`FHIR_PATIENT_FOUND value=${patientId}`);
        console.info(`hook_called_fhir_found patientId=${patientId}`);
        return undefined;
    }

    // Fallback — scan raw a2aMetadata object in session state.
    const rawMeta = callbackContext.state.get('a2aMetadata') as
        | Record<string, unknown>
        | undefined;

    if (rawMeta && typeof rawMeta === 'object') {
        const found = scanMetadataForFhir(rawMeta);
        if (found) {
            const url = found['fhirUrl'] ?? '';
            const token = found['fhirToken'] ?? '';
            const pid = found['patientId'] ?? '';
            if (url && token && pid) {
                writeFhirState(callbackContext.state, url, token, pid);
                console.info(`hook_called_fhir_from_metadata patientId=${pid}`);
                return undefined;
            }
        }
    }

    console.info('hook_called_no_fhir_context');
    return undefined;
}
