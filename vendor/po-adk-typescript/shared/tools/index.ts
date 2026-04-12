/**
 * Shared tools barrel — re-exports all shared tools so agents can import
 * from a single location.
 *
 * Usage in an agent:
 *   import { getPatientDemographics, getActiveMedications } from '../shared/tools/index.js';
 */

export {
    getPatientDemographics,
    getActiveMedications,
    getActiveConditions,
    getRecentObservations,
    getCarePlans,
    getCareTeam,
    getGoals,
} from './fhir.js';
