import { McpConstants } from "../../lib/mcp-constants";

describe("McpConstants", () => {
  it("has correct FHIR server URL header name", () => {
    expect(McpConstants.FhirServerUrlHeaderName).toBe("x-fhir-server-url");
  });

  it("has correct FHIR access token header name", () => {
    expect(McpConstants.FhirAccessTokenHeaderName).toBe("x-fhir-access-token");
  });

  it("has correct patient ID header name", () => {
    expect(McpConstants.PatientIdHeaderName).toBe("x-patient-id");
  });
});
