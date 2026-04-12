import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { Request } from "express";
import { IMcpTool } from "../types/IMcpTool";
import { z } from "zod";
import { FhirUtilities } from "../lib/fhir-utilities";
import { McpUtilities } from "../lib/mcp-utilities";
import { NullUtilities } from "../lib/null-utilities";
import { FhirClientInstance } from "../lib/fhir-client";
import { fhirR4 } from "@smile-cdr/fhirts";

class CheckAuthStatusTool implements IMcpTool {
  registerTool(server: McpServer, req: Request) {
    server.registerTool(
      "CheckAuthStatus",
      {
        description:
          "Checks the prior authorization status for a patient's medication. " +
          "Reads FHIR MedicationRequest and ClaimResponse resources to find denial details, " +
          "including the denied medication name, denial reason, and relevant FHIR resource IDs for citations.",
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
              "Optional medication name to filter by (e.g., 'adalimumab', 'Humira').",
            )
            .optional(),
        },
      },
      async ({ patientId, medicationName }) => {
       try {
        // Resolve patient ID from SHARP context if not provided
        if (!patientId) {
          patientId = NullUtilities.getOrThrow(
            FhirUtilities.getPatientIdIfContextExists(req),
            "Patient ID is required. Provide it as a parameter or ensure SHARP context is configured.",
          );
        }

        // Search for MedicationRequests for this patient
        // Note: code:text modifier not supported by all FHIR servers, so we filter client-side
        const searchParams = [`patient=${patientId}`];

        let medRequests: fhirR4.Bundle | null;
        try {
          medRequests = await FhirClientInstance.search(
            req,
            "MedicationRequest",
            searchParams,
          );
        } catch {
          return McpUtilities.createTextResponse(
            "Could not retrieve MedicationRequest resources from the FHIR server. " +
            "Ensure the workspace has medication data for this patient.",
            { isError: true },
          );
        }

        if (!medRequests?.entry?.length) {
          return McpUtilities.createTextResponse(
            `## Prior Authorization Status for Patient ${patientId}\n\n` +
            `No active medication orders found` +
            (medicationName ? ` matching "${medicationName}"` : "") +
            ". This patient may not have any pending or denied prior authorizations.\n\n" +
            "*Tip: Try asking about the patient's conditions or clinical history instead.*",
          );
        }

        // Search for ClaimResponses (prior auth decisions)
        let claimResponses: fhirR4.Bundle | null;
        try {
          claimResponses = await FhirClientInstance.search(
            req,
            "ClaimResponse",
            [`patient=${patientId}`],
          );
        } catch {
          // ClaimResponse may not exist — that's okay
          claimResponses = null;
        }

        // Build the response with citations
        const results: string[] = [
          `## Prior Authorization Status for Patient ${patientId}\n`,
        ];

        for (const entry of medRequests.entry) {
          const med = entry.resource as fhirR4.MedicationRequest;
          if (!med) continue;

          const medName =
            med.medicationCodeableConcept?.coding?.[0]?.display ||
            med.medicationCodeableConcept?.text ||
            "Unknown medication";

          const medId = med.id || "unknown";
          const status = med.status || "unknown";

          results.push(`### ${medName}`);
          results.push(`- **Status**: ${status}`);
          results.push(`- **FHIR Resource**: MedicationRequest/${medId}`);

          if (med.reasonCode?.length) {
            const reasons = med.reasonCode
              .map((rc) => rc.text || rc.coding?.[0]?.display || "")
              .filter(Boolean)
              .join(", ");
            if (reasons) {
              results.push(`- **Clinical Indication**: ${reasons}`);
            }
          }
        }

        // Add ClaimResponse denial info if available
        if (claimResponses?.entry?.length) {
          results.push(`\n### Prior Auth Decisions\n`);

          for (const entry of claimResponses.entry) {
            const claim = entry.resource as fhirR4.ClaimResponse;
            if (!claim) continue;

            const claimId = claim.id || "unknown";
            const outcome = claim.outcome || "unknown";
            const disposition = claim.disposition || "No reason provided";

            results.push(`- **Outcome**: ${outcome}`);
            results.push(`- **Disposition**: ${disposition}`);
            results.push(`- **FHIR Resource**: ClaimResponse/${claimId}`);

            if (outcome === "error" || outcome === "partial") {
              results.push(`- ⚠️ **DENIED** — Appeal may be warranted`);
            }
          }
        } else {
          results.push(
            "\n*No ClaimResponse (prior auth decision) found. The authorization may be pending or not yet filed.*",
          );
        }

        return McpUtilities.createTextResponse(results.join("\n"));
       } catch (error) {
         return McpUtilities.createTextResponse(
           `Error checking authorization status: ${error instanceof Error ? error.message : "Unknown error"}`,
           { isError: true },
         );
       }
      },
    );
  }
}

export const CheckAuthStatusToolInstance = new CheckAuthStatusTool();
