/**
 * general_agent — tools (FunctionTool wrapped for @google/adk v0.3.x)
 *
 * TypeScript equivalent of general_agent/tools/general.py.
 */

import { FunctionTool } from '@google/adk';
import { z } from 'zod/v3';

// ── getCurrentDatetime ─────────────────────────────────────────────────────────

export const getCurrentDatetime = new FunctionTool({
    name: 'getCurrentDatetime',
    description:
        'Returns the current date and time in the specified IANA timezone (e.g. "America/Chicago", "UTC").',
    parameters: z.object({
        timezone: z
            .string()
            .optional()
            .describe('IANA timezone name, e.g. "America/Chicago". Defaults to UTC.'),
    }),
    execute: (input: { timezone?: string }) => {
        const tz = input.timezone ?? 'UTC';
        try {
            const now = new Date();
            const dateStr = now.toLocaleString('en-US', {
                timeZone: tz,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
            });
            // toLocaleString: "02/23/2026, 17:18:00" → "2026-02-23T17:18:00"
            const [datePart, timePart] = dateStr.split(', ');
            if (!datePart || !timePart) throw new Error('Unexpected date format');
            const [month, day, year] = datePart.split('/');
            return { status: 'success', datetime: `${year}-${month}-${day}T${timePart}`, timezone: tz };
        } catch {
            return {
                status: 'error',
                message: `Unknown timezone: "${tz}". Use an IANA timezone name (e.g. "America/Chicago").`,
            };
        }
    },
});

// ── lookUpIcd10 ────────────────────────────────────────────────────────────────

// Representative ICD-10-CM codes for demonstration.
const ICD10_TABLE: Record<string, { code: string; description: string }[]> = {
    hypertension: [
        { code: 'I10', description: 'Essential (primary) hypertension' },
        { code: 'I11', description: 'Hypertensive heart disease' },
        { code: 'I12', description: 'Hypertensive chronic kidney disease' },
    ],
    diabetes: [
        { code: 'E11', description: 'Type 2 diabetes mellitus' },
        { code: 'E10', description: 'Type 1 diabetes mellitus' },
        { code: 'E13', description: 'Other specified diabetes mellitus' },
    ],
    'heart failure': [
        { code: 'I50.9', description: 'Heart failure, unspecified' },
        { code: 'I50.30', description: 'Unspecified diastolic heart failure' },
        { code: 'I50.20', description: 'Unspecified systolic heart failure' },
    ],
    copd: [
        { code: 'J44.0', description: 'COPD with acute lower respiratory infection' },
        { code: 'J44.1', description: 'COPD with acute exacerbation' },
        { code: 'J44.9', description: 'COPD, unspecified' },
    ],
    asthma: [
        { code: 'J45.20', description: 'Mild intermittent asthma, uncomplicated' },
        { code: 'J45.40', description: 'Moderate persistent asthma, uncomplicated' },
        { code: 'J45.50', description: 'Severe persistent asthma, uncomplicated' },
    ],
    stroke: [
        { code: 'I63.9', description: 'Cerebral infarction, unspecified' },
        { code: 'G45.9', description: 'TIA, unspecified' },
    ],
    depression: [
        { code: 'F32.9', description: 'Major depressive disorder, single episode, unspecified' },
        { code: 'F33.9', description: 'Major depressive disorder, recurrent, unspecified' },
    ],
    anxiety: [
        { code: 'F41.9', description: 'Anxiety disorder, unspecified' },
        { code: 'F41.1', description: 'Generalized anxiety disorder' },
        { code: 'F41.0', description: 'Panic disorder' },
    ],
    obesity: [
        { code: 'E66.9', description: 'Obesity, unspecified' },
        { code: 'E66.01', description: 'Morbid (severe) obesity due to excess calories' },
    ],
};

export const lookUpIcd10 = new FunctionTool({
    name: 'lookUpIcd10',
    description:
        'Looks up ICD-10-CM codes for a clinical term (e.g. "hypertension", "diabetes type 2").',
    parameters: z.object({
        term: z.string().describe('Clinical term to look up, e.g. "hypertension".'),
    }),
    execute: (input: { term: string }) => {
        const query = input.term.toLowerCase().trim();

        const exact = ICD10_TABLE[query];
        if (exact) return { status: 'success', query: input.term, results: exact };

        const partial: { code: string; description: string }[] = [];
        for (const [key, codes] of Object.entries(ICD10_TABLE)) {
            if (key.includes(query) || query.includes(key)) partial.push(...codes);
        }

        if (partial.length > 0) return { status: 'success', query: input.term, results: partial };

        return {
            status: 'not_found',
            query: input.term,
            message: `No codes found for "${input.term}". Try: hypertension, diabetes, heart failure, copd, asthma, stroke, depression, anxiety, obesity.`,
            results: [],
        };
    },
});
