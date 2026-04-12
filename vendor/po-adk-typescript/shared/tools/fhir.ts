/**
 * FHIR R4 tools — query a FHIR R4 server on behalf of the patient in context.
 *
 * TypeScript equivalent of shared/tools/fhir.py.
 *
 * These are FunctionTool instances (required by @google/adk v0.3.x).
 * At call time each tool reads FHIR credentials from toolContext.state —
 * values injected by fhirHook.extractFhirContext before the LLM was called.
 * Credentials never appear in the LLM prompt.
 *
 * State keys accepted (both camelCase and snake_case for compatibility):
 *   fhirUrl   / fhir_url
 *   fhirToken / fhir_token
 *   patientId / patient_id
 */

import { FunctionTool, ToolContext } from '@google/adk';
import { z } from 'zod/v3';

const FHIR_TIMEOUT_MS = 15_000;

// ── Internal helpers ───────────────────────────────────────────────────────────

interface FhirCredentials {
    fhirUrl: string;
    fhirToken: string;
    patientId: string;
}

const NO_CREDS_RESPONSE = {
    status: 'error',
    error_message:
        "FHIR context is not available. Ensure the caller includes 'fhir-context' " +
        'in the A2A message metadata (fhirUrl, fhirToken, patientId).',
};

function getFhirCredentials(toolContext: ToolContext): FhirCredentials | null {
    // Accept both camelCase (TypeScript) and snake_case (Python) key names.
    const fhirUrl = (toolContext.state.get('fhirUrl') ?? toolContext.state.get('fhir_url')) as string | undefined;
    const fhirToken = (toolContext.state.get('fhirToken') ?? toolContext.state.get('fhir_token')) as string | undefined;
    const patientId = (toolContext.state.get('patientId') ?? toolContext.state.get('patient_id')) as string | undefined;

    if (!fhirUrl || !fhirToken || !patientId) return null;
    return { fhirUrl: fhirUrl.replace(/\/$/, ''), fhirToken, patientId };
}

async function fhirGet(
    creds: FhirCredentials,
    path: string,
    params?: Record<string, string>,
): Promise<Record<string, unknown>> {
    const url = new URL(`${creds.fhirUrl}/${path}`);
    if (params) {
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FHIR_TIMEOUT_MS);
    try {
        const response = await fetch(url.toString(), {
            signal: controller.signal,
            headers: {
                Authorization: `Bearer ${creds.fhirToken}`,
                Accept: 'application/fhir+json',
            },
        });
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`FHIR HTTP ${response.status}: ${body.slice(0, 200)}`);
        }
        return response.json() as Promise<Record<string, unknown>>;
    } finally {
        clearTimeout(timer);
    }
}

function codingDisplay(codings: unknown[]): string {
    for (const c of codings) {
        const display = (c as Record<string, string>)['display'];
        if (display) return display;
    }
    return 'Unknown';
}

// ── Tool: patient demographics ─────────────────────────────────────────────────

export const getPatientDemographics = new FunctionTool({
    name: 'getPatientDemographics',
    description:
        'Fetches demographic information for the current patient from the FHIR server. ' +
        'Returns name, date of birth, gender, contacts, and address. ' +
        'No arguments required — the patient identity comes from the session context.',
    parameters: z.object({}),
    execute: async (_input: unknown, toolContext?: ToolContext) => {
        if (!toolContext) return NO_CREDS_RESPONSE;
        const creds = getFhirCredentials(toolContext);
        if (!creds) return NO_CREDS_RESPONSE;

        console.info(`tool_get_patient_demographics patient_id=${creds.patientId}`);
        try {
            const patient = await fhirGet(creds, `Patient/${creds.patientId}`) as Record<string, unknown>;

            const names = (patient['name'] as unknown[] | undefined) ?? [];
            const official = (names.find((n: unknown) => (n as Record<string, string>)['use'] === 'official') ?? names[0] ?? {}) as Record<string, unknown>;
            const given = ((official['given'] as string[] | undefined) ?? []).join(' ');
            const family = (official['family'] as string | undefined) ?? '';
            const fullName = `${given} ${family}`.trim() || 'Unknown';

            const contacts = ((patient['telecom'] as unknown[] | undefined) ?? []).map((t: unknown) => {
                const tc = t as Record<string, string>;
                return { system: tc['system'], value: tc['value'], use: tc['use'] };
            });

            const addrs = (patient['address'] as unknown[] | undefined) ?? [];
            let address: string | null = null;
            if (addrs.length > 0) {
                const a = addrs[0] as Record<string, unknown>;
                address = [
                    ((a['line'] as string[] | undefined) ?? []).join(' '),
                    a['city'], a['state'], a['postalCode'], a['country'],
                ].filter(Boolean).join(', ');
            }

            const maritalStatus = ((patient['maritalStatus'] as Record<string, string> | undefined) ?? {})['text'];

            return {
                status: 'success',
                patient_id: creds.patientId,
                name: fullName,
                birth_date: patient['birthDate'],
                gender: patient['gender'],
                active: patient['active'],
                contacts,
                address,
                marital_status: maritalStatus ?? null,
            };
        } catch (err) {
            console.error(`tool_get_patient_demographics_error: ${String(err)}`);
            return { status: 'error', error_message: String(err) };
        }
    },
});

// ── Tool: active medications ───────────────────────────────────────────────────

export const getActiveMedications = new FunctionTool({
    name: 'getActiveMedications',
    description:
        "Retrieves the patient's current active medication list from the FHIR server. " +
        'Returns medication names, dosage instructions, and prescribing dates. ' +
        'No arguments required.',
    parameters: z.object({}),
    execute: async (_input: unknown, toolContext?: ToolContext) => {
        if (!toolContext) return NO_CREDS_RESPONSE;
        const creds = getFhirCredentials(toolContext);
        if (!creds) return NO_CREDS_RESPONSE;

        console.info(`tool_get_active_medications patient_id=${creds.patientId}`);
        try {
            const bundle = await fhirGet(creds, 'MedicationRequest', {
                patient: creds.patientId, status: 'active', _count: '50',
            }) as Record<string, unknown>;

            const medications = ((bundle['entry'] as unknown[] | undefined) ?? []).map((entry: unknown) => {
                const res = (entry as Record<string, unknown>)['resource'] as Record<string, unknown>;
                const medConcept = (res['medicationCodeableConcept'] as Record<string, unknown> | undefined) ?? {};
                const medName = (medConcept['text'] as string | undefined)
                    ?? codingDisplay((medConcept['coding'] as unknown[] | undefined) ?? [])
                    ?? ((res['medicationReference'] as Record<string, string> | undefined) ?? {})['display']
                    ?? 'Unknown';
                const dosageList = ((res['dosageInstruction'] as unknown[] | undefined) ?? [])
                    .map((d: unknown) => (d as Record<string, string>)['text'] ?? 'No dosage text');
                return {
                    medication: medName,
                    status: res['status'],
                    dosage: dosageList[0] ?? 'Not specified',
                    authored_on: res['authoredOn'],
                    requester: ((res['requester'] as Record<string, string> | undefined) ?? {})['display'],
                };
            });

            return { status: 'success', patient_id: creds.patientId, count: medications.length, medications };
        } catch (err) {
            console.error(`tool_get_active_medications_error: ${String(err)}`);
            return { status: 'error', error_message: String(err) };
        }
    },
});

// ── Tool: active conditions ────────────────────────────────────────────────────

export const getActiveConditions = new FunctionTool({
    name: 'getActiveConditions',
    description:
        "Retrieves the patient's active conditions and diagnoses from the FHIR server. " +
        'Returns the problem list with condition names, severity, and onset dates. ' +
        'No arguments required.',
    parameters: z.object({}),
    execute: async (_input: unknown, toolContext?: ToolContext) => {
        if (!toolContext) return NO_CREDS_RESPONSE;
        const creds = getFhirCredentials(toolContext);
        if (!creds) return NO_CREDS_RESPONSE;

        console.info(`tool_get_active_conditions patient_id=${creds.patientId}`);
        try {
            const bundle = await fhirGet(creds, 'Condition', {
                patient: creds.patientId, 'clinical-status': 'active', _count: '50',
            }) as Record<string, unknown>;

            const conditions = ((bundle['entry'] as unknown[] | undefined) ?? []).map((entry: unknown) => {
                const res = (entry as Record<string, unknown>)['resource'] as Record<string, unknown>;
                const code = (res['code'] as Record<string, unknown> | undefined) ?? {};
                const codings = (code['coding'] as unknown[] | undefined) ?? [];
                const onset = (res['onsetDateTime'] as string | undefined)
                    ?? ((res['onsetPeriod'] as Record<string, string> | undefined) ?? {})['start'];
                const clinicalStatusCodings = (((res['clinicalStatus'] as Record<string, unknown> | undefined) ?? {})['coding'] as unknown[] | undefined) ?? [{}];
                return {
                    condition: (code['text'] as string | undefined) ?? codingDisplay(codings),
                    clinical_status: ((clinicalStatusCodings[0] as Record<string, string>)?.['code']),
                    severity: ((res['severity'] as Record<string, string> | undefined) ?? {})['text'],
                    onset: onset ?? null,
                    recorded_date: res['recordedDate'] ?? null,
                };
            });

            return { status: 'success', patient_id: creds.patientId, count: conditions.length, conditions };
        } catch (err) {
            console.error(`tool_get_active_conditions_error: ${String(err)}`);
            return { status: 'error', error_message: String(err) };
        }
    },
});

// ── Tool: recent observations ──────────────────────────────────────────────────

export const getRecentObservations = new FunctionTool({
    name: 'getRecentObservations',
    description:
        'Retrieves recent clinical observations for the patient from the FHIR server. ' +
        'Common categories: vital-signs (blood pressure, heart rate, SpO2), ' +
        'laboratory (CBC, HbA1c, metabolic panel), social-history (smoking, alcohol). ' +
        "Returns the 20 most recent observations in the category, newest first.",
    parameters: z.object({
        category: z
            .string()
            .optional()
            .describe(
                "FHIR observation category: 'vital-signs', 'laboratory', 'social-history'. " +
                "Defaults to 'vital-signs' if not specified.",
            ),
    }),
    execute: async (input: { category?: string }, toolContext?: ToolContext) => {
        if (!toolContext) return NO_CREDS_RESPONSE;
        const creds = getFhirCredentials(toolContext);
        if (!creds) return NO_CREDS_RESPONSE;

        const category = (input.category ?? 'vital-signs').trim().toLowerCase();
        console.info(`tool_get_recent_observations patient_id=${creds.patientId} category=${category}`);
        try {
            const bundle = await fhirGet(creds, 'Observation', {
                patient: creds.patientId, category, _sort: '-date', _count: '20',
            }) as Record<string, unknown>;

            const observations = ((bundle['entry'] as unknown[] | undefined) ?? []).map((entry: unknown) => {
                const res = (entry as Record<string, unknown>)['resource'] as Record<string, unknown>;
                const code = (res['code'] as Record<string, unknown> | undefined) ?? {};
                const obsName = (code['text'] as string | undefined) ?? codingDisplay((code['coding'] as unknown[] | undefined) ?? []);

                let value: unknown = null;
                let unit: string | null = null;
                if ('valueQuantity' in res) {
                    const vq = res['valueQuantity'] as Record<string, unknown>;
                    value = vq['value'];
                    unit = (vq['unit'] ?? vq['code']) as string | null;
                } else if ('valueCodeableConcept' in res) {
                    const vcc = res['valueCodeableConcept'] as Record<string, unknown>;
                    value = (vcc['text'] as string | undefined) ?? codingDisplay((vcc['coding'] as unknown[] | undefined) ?? []);
                } else if ('valueString' in res) {
                    value = res['valueString'];
                }

                const components = ((res['component'] as unknown[] | undefined) ?? []).map((comp: unknown) => {
                    const c = comp as Record<string, unknown>;
                    const cc = (c['code'] as Record<string, unknown> | undefined) ?? {};
                    const compVq = (c['valueQuantity'] as Record<string, unknown> | undefined) ?? {};
                    return {
                        name: (cc['text'] as string | undefined) ?? codingDisplay((cc['coding'] as unknown[] | undefined) ?? []),
                        value: compVq['value'],
                        unit: (compVq['unit'] ?? compVq['code']) as string | undefined,
                    };
                });

                const interpretations = (res['interpretation'] as unknown[] | undefined) ?? [{}];
                const interp0 = (interpretations[0] as Record<string, unknown> | undefined) ?? {};

                const effective = (res['effectiveDateTime'] as string | undefined)
                    ?? ((res['effectivePeriod'] as Record<string, string> | undefined) ?? {})['start'];

                return {
                    observation: obsName,
                    value,
                    unit,
                    components: components.length > 0 ? components : null,
                    effective_date: effective ?? null,
                    status: res['status'],
                    interpretation: (interp0['text'] as string | undefined)
                        ?? codingDisplay((interp0['coding'] as unknown[] | undefined) ?? [])
                        ?? null,
                };
            });

            return { status: 'success', patient_id: creds.patientId, category, count: observations.length, observations };
        } catch (err) {
            console.error(`tool_get_recent_observations_error: ${String(err)}`);
            return { status: 'error', error_message: String(err) };
        }
    },
});

// ── Tool: care plans ───────────────────────────────────────────────────────────

export const getCarePlans = new FunctionTool({
    name: 'getCarePlans',
    description:
        "Retrieves the patient's active care plans from the FHIR server. " +
        'Returns the plan title, category, period, narrative description, and the list ' +
        'of planned activities / interventions within each plan. ' +
        'No arguments required.',
    parameters: z.object({}),
    execute: async (_input: unknown, toolContext?: ToolContext) => {
        if (!toolContext) return NO_CREDS_RESPONSE;
        const creds = getFhirCredentials(toolContext);
        if (!creds) return NO_CREDS_RESPONSE;

        console.info(`tool_get_care_plans patient_id=${creds.patientId}`);
        try {
            const bundle = await fhirGet(creds, 'CarePlan', {
                patient: creds.patientId,
                status: 'active',
                _count: '10',
            }) as Record<string, unknown>;

            const plans = ((bundle['entry'] as unknown[] | undefined) ?? []).map((entry: unknown) => {
                const res = (entry as Record<string, unknown>)['resource'] as Record<string, unknown>;

                // Category
                const categories = ((res['category'] as unknown[] | undefined) ?? []).map((cat: unknown) => {
                    const c = cat as Record<string, unknown>;
                    return (c['text'] as string | undefined)
                        ?? codingDisplay((c['coding'] as unknown[] | undefined) ?? []);
                });

                // Period
                const period = res['period'] as Record<string, string> | undefined;

                // Narrative description (text.div is HTML — strip tags for plain text)
                const narrative = ((res['text'] as Record<string, string> | undefined) ?? {})['div'];
                const description = narrative
                    ? narrative.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500)
                    : null;

                // Activities
                const activities = ((res['activity'] as unknown[] | undefined) ?? []).map((act: unknown) => {
                    const a = act as Record<string, unknown>;
                    const detail = (a['detail'] as Record<string, unknown> | undefined) ?? {};
                    const code = (detail['code'] as Record<string, unknown> | undefined) ?? {};
                    return {
                        activity: (code['text'] as string | undefined)
                            ?? codingDisplay((code['coding'] as unknown[] | undefined) ?? []),
                        status: detail['status'] ?? null,
                        description: detail['description'] ?? null,
                    };
                });

                return {
                    title: res['title'] ?? null,
                    status: res['status'],
                    categories,
                    period_start: period?.['start'] ?? null,
                    period_end: period?.['end'] ?? null,
                    description,
                    activity_count: activities.length,
                    activities,
                };
            });

            return { status: 'success', patient_id: creds.patientId, count: plans.length, care_plans: plans };
        } catch (err) {
            console.error(`tool_get_care_plans_error: ${String(err)}`);
            return { status: 'error', error_message: String(err) };
        }
    },
});

// ── Tool: care team ────────────────────────────────────────────────────────────

export const getCareTeam = new FunctionTool({
    name: 'getCareTeam',
    description:
        "Retrieves the patient's active care team from the FHIR server. " +
        'Returns each team member with their name, role, and organisation. ' +
        'No arguments required.',
    parameters: z.object({}),
    execute: async (_input: unknown, toolContext?: ToolContext) => {
        if (!toolContext) return NO_CREDS_RESPONSE;
        const creds = getFhirCredentials(toolContext);
        if (!creds) return NO_CREDS_RESPONSE;

        console.info(`tool_get_care_team patient_id=${creds.patientId}`);
        try {
            const bundle = await fhirGet(creds, 'CareTeam', {
                patient: creds.patientId,
                status: 'active',
            }) as Record<string, unknown>;

            const teams = ((bundle['entry'] as unknown[] | undefined) ?? []).map((entry: unknown) => {
                const res = (entry as Record<string, unknown>)['resource'] as Record<string, unknown>;

                const participants = ((res['participant'] as unknown[] | undefined) ?? []).map((p: unknown) => {
                    const part = p as Record<string, unknown>;

                    // Role
                    const roleCodings = (((part['role'] as unknown[] | undefined) ?? [])[0] as Record<string, unknown> | undefined) ?? {};
                    const role = (roleCodings['text'] as string | undefined)
                        ?? codingDisplay((roleCodings['coding'] as unknown[] | undefined) ?? []);

                    // Member display name (Practitioner, RelatedPerson, Organization reference)
                    const member = (part['member'] as Record<string, string> | undefined) ?? {};
                    const name = member['display'] ?? 'Unknown';

                    // Period
                    const period = part['period'] as Record<string, string> | undefined;

                    return { name, role, on_behalf_of: (part['onBehalfOf'] as Record<string, string> | undefined)?.['display'] ?? null, period_start: period?.['start'] ?? null };
                });

                return {
                    team_name: res['name'] ?? null,
                    status: res['status'],
                    participant_count: participants.length,
                    participants,
                };
            });

            return { status: 'success', patient_id: creds.patientId, count: teams.length, care_teams: teams };
        } catch (err) {
            console.error(`tool_get_care_team_error: ${String(err)}`);
            return { status: 'error', error_message: String(err) };
        }
    },
});

// ── Tool: goals ────────────────────────────────────────────────────────────────

export const getGoals = new FunctionTool({
    name: 'getGoals',
    description:
        "Retrieves the patient's active health goals from the FHIR server. " +
        'Goals are typically linked to care plans and describe the outcomes the care team ' +
        'is working toward (e.g. target HbA1c, weight reduction, smoking cessation). ' +
        'Returns goal description, achievement status, and target dates. ' +
        'No arguments required.',
    parameters: z.object({}),
    execute: async (_input: unknown, toolContext?: ToolContext) => {
        if (!toolContext) return NO_CREDS_RESPONSE;
        const creds = getFhirCredentials(toolContext);
        if (!creds) return NO_CREDS_RESPONSE;

        console.info(`tool_get_goals patient_id=${creds.patientId}`);
        try {
            const bundle = await fhirGet(creds, 'Goal', {
                patient: creds.patientId,
                'lifecycle-status': 'active',
                _count: '20',
            }) as Record<string, unknown>;

            const goals = ((bundle['entry'] as unknown[] | undefined) ?? []).map((entry: unknown) => {
                const res = (entry as Record<string, unknown>)['resource'] as Record<string, unknown>;

                // Description
                const descCode = (res['description'] as Record<string, unknown> | undefined) ?? {};
                const description = (descCode['text'] as string | undefined)
                    ?? codingDisplay((descCode['coding'] as unknown[] | undefined) ?? []);

                // Achievement status
                const achievementCode = (res['achievementStatus'] as Record<string, unknown> | undefined) ?? {};
                const achievement = (achievementCode['text'] as string | undefined)
                    ?? codingDisplay((achievementCode['coding'] as unknown[] | undefined) ?? []);

                // Targets
                const targets = ((res['target'] as unknown[] | undefined) ?? []).map((t: unknown) => {
                    const tgt = t as Record<string, unknown>;
                    const measure = (tgt['measure'] as Record<string, unknown> | undefined) ?? {};
                    const detailQuantity = tgt['detailQuantity'] as Record<string, unknown> | undefined;
                    const detailRange = tgt['detailRange'] as Record<string, unknown> | undefined;

                    let detail: string | null = null;
                    if (detailQuantity) {
                        detail = `${detailQuantity['value']} ${detailQuantity['unit'] ?? ''}`.trim();
                    } else if (detailRange) {
                        const low = detailRange['low'] as Record<string, unknown> | undefined;
                        const high = detailRange['high'] as Record<string, unknown> | undefined;
                        detail = `${low?.['value'] ?? '?'} – ${high?.['value'] ?? '?'} ${low?.['unit'] ?? ''}`.trim();
                    }

                    return {
                        measure: (measure['text'] as string | undefined)
                            ?? codingDisplay((measure['coding'] as unknown[] | undefined) ?? []),
                        detail,
                        due_date: tgt['dueDate'] ?? null,
                    };
                });

                return {
                    description,
                    lifecycle_status: res['lifecycleStatus'],
                    achievement_status: achievement || null,
                    start_date: res['startDate'] ?? null,
                    targets,
                    note: ((res['note'] as unknown[] | undefined) ?? [])
                        .map((n: unknown) => (n as Record<string, string>)['text'])
                        .filter(Boolean)
                        .join(' ') || null,
                };
            });

            return { status: 'success', patient_id: creds.patientId, count: goals.length, goals };
        } catch (err) {
            console.error(`tool_get_goals_error: ${String(err)}`);
            return { status: 'error', error_message: String(err) };
        }
    },
});
