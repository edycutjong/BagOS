import { GenerateAppealToolInstance } from "../../tools/GenerateAppealTool";

// Mock dependencies
jest.mock("../../lib/fhir-client", () => ({
  FhirClientInstance: {
    read: jest.fn(),
    search: jest.fn(),
  },
}));

jest.mock("../../lib/gemini-client", () => ({
  getGeminiClient: jest.fn(),
}));

import { FhirClientInstance } from "../../lib/fhir-client";
import { getGeminiClient } from "../../lib/gemini-client";

const mockedFhirClient = FhirClientInstance as jest.Mocked<typeof FhirClientInstance>;
const mockedGetGemini = getGeminiClient as jest.MockedFunction<typeof getGeminiClient>;

function getToolHandler(headers: Record<string, string> = { "x-patient-id": "p1" }): (args: Record<string, unknown>) => Promise<any> {
  let handler: any;
  const mockServer = {
    registerTool: (_name: string, _opts: unknown, cb: any) => {
      handler = cb;
    },
  };
  GenerateAppealToolInstance.registerTool(mockServer as any, { headers } as any);
  return handler;
}

describe("GenerateAppealTool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("generates an appeal with full FHIR data", async () => {
    // Mock patient read
    mockedFhirClient.read.mockResolvedValue({
      resourceType: "Patient",
      id: "p1",
      name: [{ given: ["John"], family: "Doe" }],
      birthDate: "1980-01-15",
    } as any);

    // Mock condition search
    mockedFhirClient.search
      .mockResolvedValueOnce({
        entry: [{ resource: { id: "cond-1", code: { coding: [{ display: "Rheumatoid Arthritis" }] }, clinicalStatus: { coding: [{ code: "active" }] } } }],
      } as any)
      // medication search
      .mockResolvedValueOnce({
        entry: [{ resource: { id: "med-1", medicationCodeableConcept: { coding: [{ display: "Humira" }] }, status: "active" } }],
      } as any)
      // claim search
      .mockResolvedValueOnce({
        entry: [{ resource: { id: "claim-1", outcome: "error", disposition: "Step therapy not met" } }],
      } as any)
      // observation search
      .mockResolvedValueOnce({
        entry: [{ resource: { id: "obs-1", code: { coding: [{ display: "CRP" }] }, valueQuantity: { value: 12.5, unit: "mg/L" } } }],
      } as any);

    mockedGetGemini.mockReturnValue({
      generateAppeal: jest.fn().mockResolvedValue("Dear Medical Director,\n\nAppeal letter content..."),
    } as any);

    const handler = getToolHandler();
    const result = await handler({ medicationName: "Humira" });
    expect(result.content[0].text).toContain("Dear Medical Director");
  });

  it("synthesizes minimal evidence when no FHIR resources found", async () => {
    mockedFhirClient.read.mockRejectedValue(new Error("Not found"));
    mockedFhirClient.search.mockResolvedValue(null);

    const mockGenerate = jest.fn().mockResolvedValue("Appeal with minimal evidence");
    mockedGetGemini.mockReturnValue({ generateAppeal: mockGenerate } as any);

    const handler = getToolHandler();
    const result = await handler({ medicationName: "Humira", denialReason: "Step therapy not met" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe("Appeal with minimal evidence");
    // Verify synthesized resources were passed to Gemini
    const passedResources = mockGenerate.mock.calls[0][0].fhirResources;
    expect(passedResources).toContain("MedicationRequest/pending: Humira");
    expect(passedResources).toContain("ClaimResponse/denial");
    expect(passedResources).toContain("Step therapy not met");
  });

  it("handles patient read failure gracefully", async () => {
    mockedFhirClient.read.mockRejectedValue(new Error("FHIR error"));
    mockedFhirClient.search
      .mockResolvedValueOnce(null) // conditions
      .mockResolvedValueOnce({
        entry: [{ resource: { id: "med-1", medicationCodeableConcept: { text: "Humira" }, status: "active" } }],
      } as any)
      .mockResolvedValueOnce(null) // claims
      .mockResolvedValueOnce(null); // observations

    mockedGetGemini.mockReturnValue({
      generateAppeal: jest.fn().mockResolvedValue("Appeal text"),
    } as any);

    const handler = getToolHandler();
    const result = await handler({ medicationName: "Humira" });
    expect(result.content[0].text).toBe("Appeal text");
  });

  it("handles Gemini API failure", async () => {
    mockedFhirClient.read.mockResolvedValue({
      resourceType: "Patient", id: "p1", name: [{ given: ["Test"], family: "User" }],
    } as any);
    mockedFhirClient.search.mockResolvedValue(null);

    mockedGetGemini.mockReturnValue({
      generateAppeal: jest.fn().mockRejectedValue(new Error("Rate limited")),
    } as any);

    const handler = getToolHandler();
    const result = await handler({ medicationName: "Humira" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to generate appeal");
    expect(result.content[0].text).toContain("GEMINI_API_KEY");
  });

  it("uses patientId parameter when provided", async () => {
    mockedFhirClient.read.mockResolvedValue({
      resourceType: "Patient", id: "custom-p", name: [{ given: ["Jane"] }],
    } as any);
    mockedFhirClient.search.mockResolvedValue(null);

    mockedGetGemini.mockReturnValue({
      generateAppeal: jest.fn().mockResolvedValue("Appeal"),
    } as any);

    const handler = getToolHandler();
    const result = await handler({ patientId: "custom-p", medicationName: "Humira" });
    expect(result.content[0].text).toBe("Appeal");
  });

  it("handles condition with text instead of coding", async () => {
    mockedFhirClient.read.mockResolvedValue({ id: "p1", name: [{ given: ["A"], family: "B" }], birthDate: "2000-01-01" } as any);
    mockedFhirClient.search
      .mockResolvedValueOnce({
        entry: [{ resource: { id: "c1", code: { text: "Lupus" } } }],
      } as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    mockedGetGemini.mockReturnValue({ generateAppeal: jest.fn().mockResolvedValue("OK") } as any);
    const handler = getToolHandler();
    const result = await handler({ medicationName: "Test" });
    expect(result.content[0].text).toBe("OK");
  });

  it("handles null resources in entries", async () => {
    mockedFhirClient.read.mockResolvedValue({ id: "p1", name: [{ given: ["A"] }] } as any);
    mockedFhirClient.search
      .mockResolvedValueOnce({ entry: [{ resource: null }] } as any)
      .mockResolvedValueOnce({ entry: [{ resource: null }] } as any)
      .mockResolvedValueOnce({ entry: [{ resource: null }] } as any)
      .mockResolvedValueOnce({ entry: [{ resource: null }] } as any);

    mockedGetGemini.mockReturnValue({ generateAppeal: jest.fn().mockResolvedValue("Result") } as any);
    const handler = getToolHandler();
    const result = await handler({ medicationName: "X" });
    expect(result.content[0].text).toBe("Result");
  });

  it("uses ClaimResponse disposition as denialReason when not provided", async () => {
    mockedFhirClient.read.mockResolvedValue({ id: "p1", name: [{ given: ["A"] }] } as any);
    mockedFhirClient.search
      .mockResolvedValueOnce(null) // conditions
      .mockResolvedValueOnce(null) // meds
      .mockResolvedValueOnce({
        entry: [{ resource: { id: "cl1", outcome: "error", disposition: "Auto-denial reason" } }],
      } as any)
      .mockResolvedValueOnce(null); // observations

    const mockGenerate = jest.fn().mockResolvedValue("Appeal");
    mockedGetGemini.mockReturnValue({ generateAppeal: mockGenerate } as any);

    const handler = getToolHandler();
    await handler({ medicationName: "Humira" });
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ denialReason: "Auto-denial reason" }),
    );
  });

  it("handles observation with valueString", async () => {
    mockedFhirClient.read.mockResolvedValue({ id: "p1", name: [{ given: ["A"] }] } as any);
    mockedFhirClient.search
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        entry: [{ resource: { id: "o1", code: { text: "Note" }, valueString: "Positive" } }],
      } as any);

    mockedGetGemini.mockReturnValue({ generateAppeal: jest.fn().mockResolvedValue("OK") } as any);
    const handler = getToolHandler();
    const result = await handler({ medicationName: "X" });
    expect(result.content[0].text).toBe("OK");
  });

  it("handles non-Error thrown by Gemini", async () => {
    mockedFhirClient.read.mockResolvedValue({ id: "p1", name: [{ given: ["A"] }] } as any);
    mockedFhirClient.search.mockResolvedValue(null);
    mockedGetGemini.mockReturnValue({
      generateAppeal: jest.fn().mockRejectedValue("string error"),
    } as any);

    const handler = getToolHandler();
    const result = await handler({ medicationName: "X" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown error");
  });

  it("handles patient with no family name", async () => {
    mockedFhirClient.read.mockResolvedValue({ id: "p1", name: [{ given: ["Only"] }] } as any);
    mockedFhirClient.search.mockResolvedValue(null);
    mockedGetGemini.mockReturnValue({ generateAppeal: jest.fn().mockResolvedValue("OK") } as any);
    const handler = getToolHandler();
    const result = await handler({ medicationName: "X" });
    expect(result.content[0].text).toBe("OK");
  });

  it("handles patient with no birthDate", async () => {
    mockedFhirClient.read.mockResolvedValue({ id: "p1", name: [{ given: ["A"], family: "B" }] } as any);
    mockedFhirClient.search.mockResolvedValue(null);
    mockedGetGemini.mockReturnValue({ generateAppeal: jest.fn().mockResolvedValue("OK") } as any);
    const handler = getToolHandler();
    const result = await handler({ medicationName: "X" });
    expect(result.content[0].text).toBe("OK");
  });

  it("handles condition with no code", async () => {
    mockedFhirClient.read.mockResolvedValue({ id: "p1", name: [{ given: ["A"] }] } as any);
    mockedFhirClient.search
      .mockResolvedValueOnce({ entry: [{ resource: { id: "c1" } }] } as any)
      .mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mockedGetGemini.mockReturnValue({ generateAppeal: jest.fn().mockResolvedValue("OK") } as any);
    const handler = getToolHandler();
    const result = await handler({ medicationName: "X" });
    expect(result.content[0].text).toBe("OK");
  });

  it("handles medication with no medicationCodeableConcept", async () => {
    mockedFhirClient.read.mockResolvedValue({ id: "p1", name: [{ given: ["A"] }] } as any);
    mockedFhirClient.search
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ entry: [{ resource: { id: "m1", status: "active" } }] } as any)
      .mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mockedGetGemini.mockReturnValue({ generateAppeal: jest.fn().mockResolvedValue("OK") } as any);
    const handler = getToolHandler();
    const result = await handler({ medicationName: "X" });
    expect(result.content[0].text).toBe("OK");
  });

  it("handles ClaimResponse with no disposition", async () => {
    mockedFhirClient.read.mockResolvedValue({ id: "p1", name: [{ given: ["A"] }] } as any);
    mockedFhirClient.search
      .mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ entry: [{ resource: { id: "cl1", outcome: "complete" } }] } as any)
      .mockResolvedValueOnce(null);
    mockedGetGemini.mockReturnValue({ generateAppeal: jest.fn().mockResolvedValue("OK") } as any);
    const handler = getToolHandler();
    const result = await handler({ medicationName: "X" });
    expect(result.content[0].text).toBe("OK");
  });

  it("handles observation with no value", async () => {
    mockedFhirClient.read.mockResolvedValue({ id: "p1", name: [{ given: ["A"] }] } as any);
    mockedFhirClient.search
      .mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ entry: [{ resource: { id: "o1", code: {} } }] } as any);
    mockedGetGemini.mockReturnValue({ generateAppeal: jest.fn().mockResolvedValue("OK") } as any);
    const handler = getToolHandler();
    const result = await handler({ medicationName: "X" });
    expect(result.content[0].text).toBe("OK");
  });

  it("handles observation with valueQuantity without unit", async () => {
    mockedFhirClient.read.mockResolvedValue({ id: "p1", name: [{ given: ["A"] }] } as any);
    mockedFhirClient.search
      .mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ entry: [{ resource: { id: "o1", code: { coding: [{ display: "Test" }] }, valueQuantity: { value: 5 } } }] } as any);
    mockedGetGemini.mockReturnValue({ generateAppeal: jest.fn().mockResolvedValue("OK") } as any);
    const handler = getToolHandler();
    const result = await handler({ medicationName: "X" });
    expect(result.content[0].text).toBe("OK");
  });

  it("handles search errors for conditions/medications/claims/observations", async () => {
    mockedFhirClient.read.mockResolvedValue({ id: "p1", name: [{ given: ["A"] }] } as any);
    mockedFhirClient.search
      .mockRejectedValueOnce(new Error("err1"))
      .mockRejectedValueOnce(new Error("err2"))
      .mockRejectedValueOnce(new Error("err3"))
      .mockRejectedValueOnce(new Error("err4"));
    mockedGetGemini.mockReturnValue({ generateAppeal: jest.fn().mockResolvedValue("OK") } as any);
    const handler = getToolHandler();
    const result = await handler({ medicationName: "X" });
    expect(result.content[0].text).toBe("OK");
  });

  it("limits observations to 10", async () => {
    const entries = Array.from({ length: 15 }, (_, i) => ({
      resource: { id: `o${i}`, code: { text: `Obs ${i}` }, valueString: `val${i}` },
    }));
    mockedFhirClient.read.mockResolvedValue({ id: "p1", name: [{ given: ["A"] }] } as any);
    mockedFhirClient.search
      .mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ entry: entries } as any);
    const mockGenerate = jest.fn().mockResolvedValue("OK");
    mockedGetGemini.mockReturnValue({ generateAppeal: mockGenerate } as any);
    const handler = getToolHandler();
    await handler({ medicationName: "X" });
    // Should have 1 patient + 10 obs = 11 lines
    const resourceLines = mockGenerate.mock.calls[0][0].fhirResources.split("\n");
    expect(resourceLines.length).toBe(11);
  });

  it("handles patient with null name (no name array)", async () => {
    mockedFhirClient.read.mockResolvedValue({ id: "p1" } as any);
    mockedFhirClient.search.mockResolvedValue(null);
    mockedGetGemini.mockReturnValue({ generateAppeal: jest.fn().mockResolvedValue("OK") } as any);
    const handler = getToolHandler();
    const result = await handler({ medicationName: "X" });
    expect(result.content[0].text).toBe("OK");
  });

  it("handles patient read returning null (not throwing)", async () => {
    mockedFhirClient.read.mockResolvedValue(null);
    mockedFhirClient.search
      .mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const mockGenerate = jest.fn().mockResolvedValue("OK");
    mockedGetGemini.mockReturnValue({ generateAppeal: mockGenerate } as any);
    const handler = getToolHandler();
    const result = await handler({ medicationName: "X" });
    // With no patient and no FHIR resources, it should synthesize minimal evidence
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBe("OK");
    const passedResources = mockGenerate.mock.calls[0][0].fhirResources;
    expect(passedResources).toContain("MedicationRequest/pending: X");
  });

  it("handles patient with given as undefined (only family name)", async () => {
    mockedFhirClient.read.mockResolvedValue({ id: "p1", name: [{ family: "Solo" }], birthDate: "2000-01-01" } as any);
    mockedFhirClient.search.mockResolvedValue(null);
    const mockGenerate = jest.fn().mockResolvedValue("OK");
    mockedGetGemini.mockReturnValue({ generateAppeal: mockGenerate } as any);
    const handler = getToolHandler();
    await handler({ medicationName: "X" });
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ patientSummary: expect.stringContaining("Solo") }),
    );
  });

  it("handles condition with no clinicalStatus", async () => {
    mockedFhirClient.read.mockResolvedValue({ id: "p1", name: [{ given: ["A"] }] } as any);
    mockedFhirClient.search
      .mockResolvedValueOnce({ entry: [{ resource: { id: "c1", code: { coding: [{ display: "Test" }] } } }] } as any)
      .mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mockedGetGemini.mockReturnValue({ generateAppeal: jest.fn().mockResolvedValue("OK") } as any);
    const handler = getToolHandler();
    const result = await handler({ medicationName: "X" });
    expect(result.content[0].text).toBe("OK");
  });

  it("handles medication with text-only concept and no status", async () => {
    mockedFhirClient.read.mockResolvedValue({ id: "p1", name: [{ given: ["A"] }] } as any);
    mockedFhirClient.search
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ entry: [{ resource: { id: "m1", medicationCodeableConcept: { text: "Aspirin" } } }] } as any)
      .mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mockedGetGemini.mockReturnValue({ generateAppeal: jest.fn().mockResolvedValue("OK") } as any);
    const handler = getToolHandler();
    const result = await handler({ medicationName: "X" });
    expect(result.content[0].text).toBe("OK");
  });

  it("does not override denialReason when already provided", async () => {
    mockedFhirClient.read.mockResolvedValue({ id: "p1", name: [{ given: ["A"] }] } as any);
    mockedFhirClient.search
      .mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ entry: [{ resource: { id: "cl1", outcome: "error", disposition: "Auto reason" } }] } as any)
      .mockResolvedValueOnce(null);
    const mockGenerate = jest.fn().mockResolvedValue("OK");
    mockedGetGemini.mockReturnValue({ generateAppeal: mockGenerate } as any);
    const handler = getToolHandler();
    await handler({ medicationName: "X", denialReason: "Explicit reason" });
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ denialReason: "Explicit reason" }),
    );
  });

  it("handles observation with no code coding or text", async () => {
    mockedFhirClient.read.mockResolvedValue({ id: "p1", name: [{ given: ["A"] }] } as any);
    mockedFhirClient.search
      .mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ entry: [{ resource: { id: "o1" } }] } as any);
    mockedGetGemini.mockReturnValue({ generateAppeal: jest.fn().mockResolvedValue("OK") } as any);
    const handler = getToolHandler();
    const result = await handler({ medicationName: "X" });
    expect(result.content[0].text).toBe("OK");
  });

  it("handles claim with no outcome", async () => {
    mockedFhirClient.read.mockResolvedValue({ id: "p1", name: [{ given: ["A"] }] } as any);
    mockedFhirClient.search
      .mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ entry: [{ resource: { id: "cl1" } }] } as any)
      .mockResolvedValueOnce(null);
    mockedGetGemini.mockReturnValue({ generateAppeal: jest.fn().mockResolvedValue("OK") } as any);
    const handler = getToolHandler();
    const result = await handler({ medicationName: "X" });
    expect(result.content[0].text).toBe("OK");
  });
});
