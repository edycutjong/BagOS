import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { Request } from "express";
import { IMcpTool } from "../types/IMcpTool";
import { z } from "zod";
import { FhirUtilities } from "../lib/fhir-utilities";
import { McpUtilities } from "../lib/mcp-utilities";
import { NullUtilities } from "../lib/null-utilities";
import { FhirClientInstance } from "../lib/fhir-client";
import { getGeminiClient } from "../lib/gemini-client";
import { fhirR4 } from "@smile-cdr/fhirts";

class GenerateAppealTool implements IMcpTool {
  registerTool(server: McpServer, req: Request) {
    server.registerTool(
      "GenerateAppeal",
      {
        description:
          "Generates a citation-driven prior authorization appeal letter for a denied medication. " +
          "Reads the patient's FHIR record to gather clinical evidence, then uses AI to draft " +
          "a professional appeal letter with inline citations to specific FHIR resources.",
        inputSchema: {
          patientId: z
            .string()
            .describe(
              "The patient ID. Optional if patient context already exists via SHARP headers.",
            )
            .optional(),
          medicationName: z
            .string()
            .describe(
              "The denied medication name (e.g., 'Humira', 'adalimumab').",
            ),
          denialReason: z
            .string()
            .describe(
              "The reason the prior authorization was denied (e.g., 'Step therapy requirement not met').",
            )
            .optional(),
        },
      },
      async ({ patientId, medicationName, denialReason }) => {
        // Resolve patient ID
        if (!patientId) {
          patientId = NullUtilities.getOrThrow(
            FhirUtilities.getPatientIdIfContextExists(req),
            "Patient ID is required.",
          );
        }

        // Gather FHIR data for the appeal
        const fhirResources: string[] = [];
        let patientSummary = "";

        // 1. Get patient demographics
        try {
          const patient = await FhirClientInstance.read<fhirR4.Patient>(
            req,
            `Patient/${patientId}`,
          );
          if (patient) {
            const name =
              patient.name?.[0]?.given?.join(" ") +
              " " +
              (patient.name?.[0]?.family || "");
            const dob = patient.birthDate || "unknown";
            patientSummary = `Patient: ${name.trim()}, DOB: ${dob}`;
            fhirResources.push(
              `- Patient/${patient.id}: ${name.trim()}, DOB ${dob}`,
            );
          }
        } catch {
          patientSummary = `Patient ID: ${patientId}`;
        }

        // 2. Get conditions (diagnoses)
        try {
          const conditions = await FhirClientInstance.search(req, "Condition", [
            `patient=${patientId}`,
          ]);
          if (conditions?.entry?.length) {
            for (const entry of conditions.entry) {
              const condition = entry.resource as fhirR4.Condition;
              if (!condition) continue;
              const display =
                condition.code?.coding?.[0]?.display ||
                condition.code?.text ||
                "Unknown condition";
              const status = condition.clinicalStatus?.coding?.[0]?.code || "unknown";
              fhirResources.push(
                `- Condition/${condition.id}: ${display} (status: ${status})`,
              );
            }
          }
        } catch {
          // Conditions may not exist
        }

        // 3. Get medication history
        try {
          const meds = await FhirClientInstance.search(
            req,
            "MedicationRequest",
            [`patient=${patientId}`],
          );
          if (meds?.entry?.length) {
            for (const entry of meds.entry) {
              const med = entry.resource as fhirR4.MedicationRequest;
              if (!med) continue;
              const medName =
                med.medicationCodeableConcept?.coding?.[0]?.display ||
                med.medicationCodeableConcept?.text ||
                "Unknown medication";
              const status = med.status || "unknown";
              fhirResources.push(
                `- MedicationRequest/${med.id}: ${medName} (status: ${status})`,
              );
            }
          }
        } catch {
          // Medications may not exist
        }

        // 4. Get claim responses (denial details)
        try {
          const claims = await FhirClientInstance.search(
            req,
            "ClaimResponse",
            [`patient=${patientId}`],
          );
          if (claims?.entry?.length) {
            for (const entry of claims.entry) {
              const claim = entry.resource as fhirR4.ClaimResponse;
              if (!claim) continue;
              const outcome = claim.outcome || "unknown";
              const disposition = claim.disposition || "";
              fhirResources.push(
                `- ClaimResponse/${claim.id}: outcome=${outcome}, disposition="${disposition}"`,
              );
              if (!denialReason && disposition) {
                denialReason = disposition;
              }
            }
          }
        } catch {
          // Claims may not exist
        }

        // 5. Get observations (lab results, vitals)
        try {
          const obs = await FhirClientInstance.search(req, "Observation", [
            `patient=${patientId}`,
            "category=laboratory",
          ]);
          if (obs?.entry?.length) {
            for (const entry of obs.entry.slice(0, 10)) {
              const observation = entry.resource as fhirR4.Observation;
              if (!observation) continue;
              const display =
                observation.code?.coding?.[0]?.display ||
                observation.code?.text ||
                "Unknown observation";
              const value =
                observation.valueQuantity
                  ? `${observation.valueQuantity.value} ${observation.valueQuantity.unit || ""}`
                  : observation.valueString || "";
              fhirResources.push(
                `- Observation/${observation.id}: ${display} = ${value}`,
              );
            }
          }
        } catch {
          // Observations may not exist
        }

        // If no FHIR resources were found, synthesize minimal evidence from provided parameters
        if (fhirResources.length === 0) {
          // Use provided parameters as minimal evidence
          fhirResources.push(
            `- MedicationRequest/pending: ${medicationName} (status: denied)`,
          );
          if (denialReason) {
            fhirResources.push(
              `- ClaimResponse/denial: outcome=denied, disposition="${denialReason}"`,
            );
          }
          patientSummary = `Patient ID: ${patientId}`;
        }

        // Generate the appeal with Gemini
        try {
          const gemini = getGeminiClient();
          const appealText = await gemini.generateAppeal({
            patientSummary,
            denialReason: denialReason || "Not specified — please review the clinical record",
            medicationName,
            fhirResources: fhirResources.join("\n"),
          });

          return McpUtilities.createTextResponse(appealText);
        } catch (error) {
          return McpUtilities.createTextResponse(
            `Failed to generate appeal: ${error instanceof Error ? error.message : "Unknown error"}. ` +
            `Ensure GEMINI_API_KEY is configured in the server environment.`,
            { isError: true },
          );
        }
      },
    );
  }
}

export const GenerateAppealToolInstance = new GenerateAppealTool();
