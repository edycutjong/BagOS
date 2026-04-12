import { CheckAuthStatusToolInstance } from "../../tools/CheckAuthStatusTool";

// Mock dependencies
jest.mock("../../lib/fhir-client", () => ({
  FhirClientInstance: {
    read: jest.fn(),
    search: jest.fn(),
  },
}));

import { FhirClientInstance } from "../../lib/fhir-client";
const mockedFhirClient = FhirClientInstance as jest.Mocked<typeof FhirClientInstance>;

// Helper to extract the tool handler from registerTool
function getToolHandler(): (args: Record<string, unknown>) => Promise<any> {
  let handler: any;
  const mockServer = {
    registerTool: (_name: string, _opts: unknown, cb: any) => {
      handler = cb;
    },
  };
  const mockReq = {
    headers: { "x-patient-id": "test-patient-1" },
  } as any;

  CheckAuthStatusToolInstance.registerTool(mockServer as any, mockReq);
  return handler;
}

describe("CheckAuthStatusTool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns informational message when no MedicationRequests found", async () => {
    mockedFhirClient.search.mockResolvedValue({ resourceType: "Bundle", entry: [] } as any);
    const handler = getToolHandler();
    const result = await handler({});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("No active medication orders found");
  });

  it("returns informational message with medication filter text", async () => {
    mockedFhirClient.search.mockResolvedValue({ resourceType: "Bundle", entry: [] } as any);
    const handler = getToolHandler();
    const result = await handler({ medicationName: "Humira" });
    expect(result.content[0].text).toContain('matching "Humira"');
  });

  it("returns medication status when MedicationRequests exist", async () => {
    mockedFhirClient.search
      .mockResolvedValueOnce({
        resourceType: "Bundle",
        entry: [
          {
            resource: {
              resourceType: "MedicationRequest",
              id: "med-1",
              status: "active",
              medicationCodeableConcept: {
                coding: [{ display: "Humira" }],
              },
              reasonCode: [{ text: "Rheumatoid arthritis" }],
            },
          },
        ],
      } as any)
      .mockResolvedValueOnce(null); // ClaimResponse search

    const handler = getToolHandler();
    const result = await handler({});
    const text = result.content[0].text;
    expect(text).toContain("Humira");
    expect(text).toContain("active");
    expect(text).toContain("MedicationRequest/med-1");
    expect(text).toContain("Rheumatoid arthritis");
    expect(text).toContain("No ClaimResponse");
  });

  it("includes ClaimResponse denial info", async () => {
    mockedFhirClient.search
      .mockResolvedValueOnce({
        resourceType: "Bundle",
        entry: [
          {
            resource: {
              resourceType: "MedicationRequest",
              id: "med-1",
              status: "active",
              medicationCodeableConcept: { text: "Adalimumab" },
            },
          },
        ],
      } as any)
      .mockResolvedValueOnce({
        resourceType: "Bundle",
        entry: [
          {
            resource: {
              resourceType: "ClaimResponse",
              id: "claim-1",
              outcome: "error",
              disposition: "Step therapy requirement not met",
            },
          },
        ],
      } as any);

    const handler = getToolHandler();
    const result = await handler({});
    const text = result.content[0].text;
    expect(text).toContain("Step therapy requirement not met");
    expect(text).toContain("DENIED");
    expect(text).toContain("ClaimResponse/claim-1");
  });

  it("handles ClaimResponse with partial outcome", async () => {
    mockedFhirClient.search
      .mockResolvedValueOnce({
        resourceType: "Bundle",
        entry: [{ resource: { resourceType: "MedicationRequest", id: "m1", status: "active" } }],
      } as any)
      .mockResolvedValueOnce({
        resourceType: "Bundle",
        entry: [{ resource: { resourceType: "ClaimResponse", id: "c1", outcome: "partial" } }],
      } as any);

    const handler = getToolHandler();
    const result = await handler({});
    expect(result.content[0].text).toContain("DENIED");
  });

  it("handles ClaimResponse search throwing", async () => {
    mockedFhirClient.search
      .mockResolvedValueOnce({
        resourceType: "Bundle",
        entry: [{ resource: { resourceType: "MedicationRequest", id: "m1", status: "active" } }],
      } as any)
      .mockRejectedValueOnce(new Error("FHIR error"));

    const handler = getToolHandler();
    const result = await handler({});
    expect(result.content[0].text).toContain("No ClaimResponse");
  });

  it("handles MedicationRequest search throwing", async () => {
    mockedFhirClient.search.mockRejectedValue(new Error("Network error"));
    const handler = getToolHandler();
    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Could not retrieve MedicationRequest");
  });

  it("uses patientId parameter when provided", async () => {
    mockedFhirClient.search.mockResolvedValue({ resourceType: "Bundle", entry: [] } as any);
    const handler = getToolHandler();
    const result = await handler({ patientId: "custom-patient" });
    expect(result.content[0].text).toContain("custom-patient");
  });

  it("handles entry with null resource", async () => {
    mockedFhirClient.search
      .mockResolvedValueOnce({
        resourceType: "Bundle",
        entry: [{ resource: null }, { resource: { id: "m2", status: "active" } }],
      } as any)
      .mockResolvedValueOnce({
        resourceType: "Bundle",
        entry: [{ resource: null }],
      } as any);

    const handler = getToolHandler();
    const result = await handler({});
    expect(result.content[0].text).toContain("MedicationRequest/m2");
  });

  it("handles medication with coding display from reasonCode", async () => {
    mockedFhirClient.search
      .mockResolvedValueOnce({
        resourceType: "Bundle",
        entry: [{
          resource: {
            id: "m3",
            status: "active",
            reasonCode: [{ coding: [{ display: "RA" }] }],
          },
        }],
      } as any)
      .mockResolvedValueOnce(null);

    const handler = getToolHandler();
    const result = await handler({});
    expect(result.content[0].text).toContain("RA");
  });

  it("handles medication without medicationName filter", async () => {
    mockedFhirClient.search.mockResolvedValue({ resourceType: "Bundle", entry: [] } as any);
    const handler = getToolHandler();
    const result = await handler({});
    expect(result.content[0].text).not.toContain('matching');
  });

  it("handles medication with no coding display (falls to Unknown)", async () => {
    mockedFhirClient.search
      .mockResolvedValueOnce({
        resourceType: "Bundle",
        entry: [{ resource: { id: "m5", status: "active", medicationCodeableConcept: {} } }],
      } as any)
      .mockResolvedValueOnce(null);

    const handler = getToolHandler();
    const result = await handler({});
    expect(result.content[0].text).toContain("Unknown medication");
  });

  it("handles medication with text instead of coding display", async () => {
    mockedFhirClient.search
      .mockResolvedValueOnce({
        resourceType: "Bundle",
        entry: [{ resource: { id: "m6", status: "active", medicationCodeableConcept: { text: "Methotrexate" } } }],
      } as any)
      .mockResolvedValueOnce(null);

    const handler = getToolHandler();
    const result = await handler({});
    expect(result.content[0].text).toContain("Methotrexate");
  });

  it("handles reasonCode with empty text and no coding", async () => {
    mockedFhirClient.search
      .mockResolvedValueOnce({
        resourceType: "Bundle",
        entry: [{ resource: { id: "m7", status: "active", reasonCode: [{ text: "" }] } }],
      } as any)
      .mockResolvedValueOnce(null);

    const handler = getToolHandler();
    const result = await handler({});
    expect(result.content[0].text).not.toContain("Clinical Indication");
  });

  it("handles medication with no id or status", async () => {
    mockedFhirClient.search
      .mockResolvedValueOnce({
        resourceType: "Bundle",
        entry: [{ resource: { resourceType: "MedicationRequest" } }],
      } as any)
      .mockResolvedValueOnce(null);

    const handler = getToolHandler();
    const result = await handler({});
    expect(result.content[0].text).toContain("unknown");
  });

  it("handles ClaimResponse with complete outcome (no DENIED flag)", async () => {
    mockedFhirClient.search
      .mockResolvedValueOnce({
        resourceType: "Bundle",
        entry: [{ resource: { id: "m1", status: "active" } }],
      } as any)
      .mockResolvedValueOnce({
        resourceType: "Bundle",
        entry: [{ resource: { id: "c2", outcome: "complete", disposition: "Approved" } }],
      } as any);

    const handler = getToolHandler();
    const result = await handler({});
    expect(result.content[0].text).toContain("Approved");
    expect(result.content[0].text).not.toContain("DENIED");
  });

  it("handles ClaimResponse with no outcome or disposition", async () => {
    mockedFhirClient.search
      .mockResolvedValueOnce({
        resourceType: "Bundle",
        entry: [{ resource: { id: "m1", status: "active" } }],
      } as any)
      .mockResolvedValueOnce({
        resourceType: "Bundle",
        entry: [{ resource: { resourceType: "ClaimResponse" } }],
      } as any);

    const handler = getToolHandler();
    const result = await handler({});
    expect(result.content[0].text).toContain("unknown");
    expect(result.content[0].text).toContain("No reason provided");
  });

  it("handles null medRequests response", async () => {
    mockedFhirClient.search.mockResolvedValue(null);
    const handler = getToolHandler();
    const result = await handler({});
    expect(result.content[0].text).toContain("No active medication orders found");
  });

  it("catches unexpected errors in top-level try/catch", async () => {
    const mockReq = { headers: {} } as any;
    let handler: any;
    const server = {
      registerTool: (_name: string, _opts: unknown, cb: any) => { handler = cb; },
    };
    CheckAuthStatusToolInstance.registerTool(server as any, mockReq);

    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error checking authorization status");
  });

  it("catches non-Error thrown in top-level try/catch", async () => {
    // We need to throw a non-Error that bypasses the inner try/catch blocks.
    // The outer catch has: error instanceof Error ? error.message : "Unknown error"
    // We do this by making the MedicationRequest search succeed,
    // then having the entries iteration throw a non-Error.
    mockedFhirClient.search.mockResolvedValueOnce({
      resourceType: "Bundle",
      // Force iteration to throw by returning a non-iterable entry value
      get entry() { throw "string error"; },
    } as any);

    const handler = getToolHandler();
    const result = await handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown error");
  });
});
