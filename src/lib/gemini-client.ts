import { GoogleGenAI } from "@google/genai";

const APPEAL_SYSTEM_PROMPT = `You are a clinical appeals specialist generating prior authorization appeal letters.

CRITICAL RULES:
1. Every clinical claim MUST cite a specific FHIR resource ID in brackets, e.g., [MedicationRequest/abc-123]
2. Do NOT fabricate clinical data. Only reference information provided in the context.
3. Structure the letter professionally with: recipient, subject, clinical summary, medical necessity argument, and conclusion.
4. Use formal medical language appropriate for a payer medical director.
5. Include specific drug names, diagnoses, and treatment history from the FHIR data.
6. Reference relevant clinical guidelines when arguing medical necessity (e.g., ACR guidelines for rheumatoid arthritis).

OUTPUT FORMAT:
Return the appeal letter as plain text with inline FHIR citations in [ResourceType/id] format.`;

class GeminiClient {
  private ai: GoogleGenAI;
  private model: string;

  constructor() {
    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY environment variable is required. Get one at https://aistudio.google.com/apikey",
      );
    }
    this.ai = new GoogleGenAI({ apiKey });
    this.model = process.env["GEMINI_MODEL"] || "gemini-2.5-flash";
  }

  async generateAppeal(context: {
    patientSummary: string;
    denialReason: string;
    medicationName: string;
    fhirResources: string;
  }): Promise<string> {
    const userPrompt = `Generate a prior authorization appeal letter for the following case:

## Patient Summary
${context.patientSummary}

## Denied Medication
${context.medicationName}

## Denial Reason
${context.denialReason}

## Available FHIR Resources (use these for citations)
${context.fhirResources}

Write a compelling, evidence-based appeal letter. Every clinical claim must cite a FHIR resource ID.`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: userPrompt,
        config: {
          systemInstruction: APPEAL_SYSTEM_PROMPT,
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("Gemini returned empty response");
      }

      return text;
    } catch (error) {
      console.error("Gemini API error:", error);
      throw new Error(
        `Failed to generate appeal: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}

// Lazy initialization — only created when first used
let _instance: GeminiClient | null = null;

export function getGeminiClient(): GeminiClient {
  if (!_instance) {
    _instance = new GeminiClient();
  }
  return _instance;
}
