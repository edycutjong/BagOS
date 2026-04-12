import { GetAppealPdfToolInstance } from "../../tools/GetAppealPdfTool";

jest.mock("../../lib/fhir-client", () => ({
  FhirClientInstance: {
    read: jest.fn(),
    search: jest.fn(),
  },
}));

import { FhirClientInstance } from "../../lib/fhir-client";
const mockedFhirClient = FhirClientInstance as jest.Mocked<typeof FhirClientInstance>;

function getToolHandler(headers: Record<string, string> = { "x-patient-id": "p1" }): (args: Record<string, unknown>) => Promise<any> {
  let handler: any;
  const mockServer = {
    registerTool: (_name: string, _opts: unknown, cb: any) => {
      handler = cb;
    },
  };
  GetAppealPdfToolInstance.registerTool(mockServer as any, { headers } as any);
  return handler;
}

describe("GetAppealPdfTool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("generates a formatted appeal document with patient info", async () => {
    mockedFhirClient.read.mockResolvedValue({
      resourceType: "Patient",
      id: "p1",
      name: [{ given: ["Sarah", "Jane"], family: "Chen" }],
      birthDate: "1985-03-15",
    } as any);

    const handler = getToolHandler();
    const result = await handler({
      appealText: "Dear Medical Director,\n\nThis is an appeal.",
    });

    const text = result.content[0].text;
    expect(text).toContain("# Prior Authorization Appeal");
    expect(text).toContain("Sarah Jane Chen");
    expect(text).toContain("1985-03-15");
    expect(text).toContain("Patient/p1");
    expect(text).toContain("Dear Medical Director");
    expect(text).toContain("BagOS MCP Server");
  });

  it("uses default values when patient read fails", async () => {
    mockedFhirClient.read.mockRejectedValue(new Error("Not found"));

    const handler = getToolHandler();
    const result = await handler({ appealText: "Appeal body" });

    const text = result.content[0].text;
    expect(text).toContain("Unknown Patient");
    expect(text).toContain("Unknown");
    expect(text).toContain("Appeal body");
  });

  it("uses patientId parameter when provided", async () => {
    mockedFhirClient.read.mockResolvedValue({
      id: "custom-id",
      name: [{ given: ["Tom"], family: "Smith" }],
      birthDate: "1990-05-20",
    } as any);

    const handler = getToolHandler();
    const result = await handler({
      patientId: "custom-id",
      appealText: "Custom appeal",
    });

    expect(result.content[0].text).toContain("Tom Smith");
    expect(result.content[0].text).toContain("custom-id");
  });

  it("handles patient with no name gracefully", async () => {
    mockedFhirClient.read.mockResolvedValue({
      id: "p1",
      name: [{}],
    } as any);

    const handler = getToolHandler();
    const result = await handler({ appealText: "Appeal" });
    expect(result.content[0].text).toContain("Unknown Patient");
  });

  it("handles null patient response", async () => {
    mockedFhirClient.read.mockResolvedValue(null);

    const handler = getToolHandler();
    const result = await handler({ appealText: "Appeal" });
    expect(result.content[0].text).toContain("Unknown Patient");
  });

  it("throws when no patient ID available", async () => {
    const handler = getToolHandler({});
    await expect(handler({ appealText: "Appeal" })).rejects.toThrow(
      "Patient ID is required",
    );
  });

  it("handles patient name with only family", async () => {
    mockedFhirClient.read.mockResolvedValue({
      id: "p1",
      name: [{ family: "OnlyFamily" }],
      birthDate: "1990-01-01",
    } as any);

    const handler = getToolHandler();
    const result = await handler({ appealText: "Appeal" });
    expect(result.content[0].text).toContain("OnlyFamily");
  });

  it("handles patient with empty name given array", async () => {
    mockedFhirClient.read.mockResolvedValue({
      id: "p1",
      name: [{ given: [], family: "Smith" }],
    } as any);

    const handler = getToolHandler();
    const result = await handler({ appealText: "Appeal" });
    expect(result.content[0].text).toContain("Smith");
  });

  it("handles patient with no birthDate", async () => {
    mockedFhirClient.read.mockResolvedValue({
      id: "p1",
      name: [{ given: ["A"], family: "B" }],
    } as any);

    const handler = getToolHandler();
    const result = await handler({ appealText: "Appeal" });
    expect(result.content[0].text).toContain("Unknown");
  });

  it("handles patient with only given name (no family)", async () => {
    mockedFhirClient.read.mockResolvedValue({
      id: "p1",
      name: [{ given: ["OnlyGiven"] }],
      birthDate: "1990-01-01",
    } as any);

    const handler = getToolHandler();
    const result = await handler({ appealText: "Appeal" });
    expect(result.content[0].text).toContain("OnlyGiven");
  });

  it("handles patient with no name property at all", async () => {
    mockedFhirClient.read.mockResolvedValue({
      id: "p1",
      birthDate: "1990-01-01",
    } as any);

    const handler = getToolHandler();
    const result = await handler({ appealText: "Appeal" });
    expect(result.content[0].text).toContain("Unknown Patient");
  });

  it("handles patient with no id field", async () => {
    mockedFhirClient.read.mockResolvedValue({
      name: [{ given: ["A"], family: "B" }],
      birthDate: "1990-01-01",
    } as any);

    const handler = getToolHandler();
    const result = await handler({ appealText: "Appeal" });
    // Should fall back to using the param patientId
    expect(result.content[0].text).toContain("Patient/p1");
  });
});
