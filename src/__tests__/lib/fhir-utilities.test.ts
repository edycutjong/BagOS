import { FhirUtilities } from "../../lib/fhir-utilities";
import { Request } from "express";

// Helper to create a mock request with headers
function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

describe("FhirUtilities", () => {
  describe("getFhirContext", () => {
    it("returns null when no FHIR server URL header is present", () => {
      const req = mockReq({});
      expect(FhirUtilities.getFhirContext(req)).toBeNull();
    });

    it("returns context with URL only when no token provided", () => {
      const req = mockReq({
        "x-fhir-server-url": "https://fhir.example.com",
      });
      const ctx = FhirUtilities.getFhirContext(req);
      expect(ctx).toEqual({
        url: "https://fhir.example.com",
        token: undefined,
      });
    });

    it("returns context with URL and token", () => {
      const req = mockReq({
        "x-fhir-server-url": "https://fhir.example.com",
        "x-fhir-access-token": "Bearer abc123",
      });
      const ctx = FhirUtilities.getFhirContext(req);
      expect(ctx).toEqual({
        url: "https://fhir.example.com",
        token: "Bearer abc123",
      });
    });
  });

  describe("getPatientIdIfContextExists", () => {
    it("returns null when no headers are set", () => {
      const req = mockReq({});
      expect(FhirUtilities.getPatientIdIfContextExists(req)).toBeNull();
    });

    it("returns patient ID from x-patient-id header", () => {
      const req = mockReq({ "x-patient-id": "patient-123" });
      expect(FhirUtilities.getPatientIdIfContextExists(req)).toBe("patient-123");
    });

    it("extracts patient ID from JWT token", () => {
      // Create a minimal JWT with a 'patient' claim
      // JWT: header.payload.signature
      const payload = Buffer.from(
        JSON.stringify({ patient: "jwt-patient-456" }),
      ).toString("base64url");
      const jwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.fakesig`;

      const req = mockReq({ "x-fhir-access-token": jwt });
      expect(FhirUtilities.getPatientIdIfContextExists(req)).toBe(
        "jwt-patient-456",
      );
    });

    it("converts numeric patient claim to string via toString", () => {
      const payload = Buffer.from(
        JSON.stringify({ patient: 12345 }),
      ).toString("base64url");
      const jwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.fakesig`;

      const req = mockReq({ "x-fhir-access-token": jwt });
      expect(FhirUtilities.getPatientIdIfContextExists(req)).toBe("12345");
    });

    it("returns null when JWT patient claim is null", () => {
      const payload = Buffer.from(
        JSON.stringify({ patient: null }),
      ).toString("base64url");
      const jwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.fakesig`;

      const req = mockReq({ "x-fhir-access-token": jwt });
      expect(FhirUtilities.getPatientIdIfContextExists(req)).toBeNull();
    });

    it("falls back to x-patient-id when JWT has no patient claim", () => {
      const payload = Buffer.from(
        JSON.stringify({ sub: "user-1" }),
      ).toString("base64url");
      const jwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.fakesig`;

      const req = mockReq({
        "x-fhir-access-token": jwt,
        "x-patient-id": "fallback-789",
      });
      expect(FhirUtilities.getPatientIdIfContextExists(req)).toBe(
        "fallback-789",
      );
    });
  });
});
