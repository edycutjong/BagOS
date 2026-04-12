 
import { Request } from "express";

// Mock axios before importing fhir-client
const mockAxiosCall = jest.fn();
const mockIsAxiosError = jest.fn();

jest.mock("axios", () => {
  const fn = (...args: any[]) => mockAxiosCall(...args);
  fn.isAxiosError = (...args: any[]) => mockIsAxiosError(...args);
  return {
    __esModule: true,
    default: fn,
    isAxiosError: fn.isAxiosError,
  };
});

import { FhirClientInstance } from "../../lib/fhir-client";

function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

describe("FhirClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("read", () => {
    it("reads a FHIR resource with auth token", async () => {
      const patient = { resourceType: "Patient", id: "123" };
      mockAxiosCall.mockResolvedValue({ data: patient });

      const req = mockReq({
        "x-fhir-server-url": "https://fhir.example.com",
        "x-fhir-access-token": "token-abc",
      });

      const result = await FhirClientInstance.read(req, "Patient/123");
      expect(result).toEqual(patient);
      expect(mockAxiosCall).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "get",
          url: "https://fhir.example.com/Patient/123",
          headers: { Authorization: "Bearer token-abc" },
        }),
      );
    });

    it("reads without auth token when not provided", async () => {
      mockAxiosCall.mockResolvedValue({ data: { id: "1" } });
      const req = mockReq({ "x-fhir-server-url": "https://fhir.example.com" });
      const result = await FhirClientInstance.read(req, "Patient/1");
      expect(result).toEqual({ id: "1" });
    });

    it("strips leading slash from path", async () => {
      mockAxiosCall.mockResolvedValue({ data: { id: "1" } });
      const req = mockReq({ "x-fhir-server-url": "https://fhir.example.com" });
      await FhirClientInstance.read(req, "/Patient/123");
      expect(mockAxiosCall).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://fhir.example.com/Patient/123",
        }),
      );
    });

    it("throws when no FHIR server URL header", async () => {
      const req = mockReq({});
      await expect(FhirClientInstance.read(req, "Patient/1")).rejects.toThrow(
        "X-FHIR-Server-URL header",
      );
    });

    it("returns null on 404 response", async () => {
      const axiosError = new Error("Not Found");
      (axiosError as any).response = { status: 404 };
      mockAxiosCall.mockRejectedValue(axiosError);
      mockIsAxiosError.mockReturnValue(true);

      const req = mockReq({ "x-fhir-server-url": "https://fhir.example.com" });
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      const result = await FhirClientInstance.read(req, "Patient/999");
      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });

    it("throws on non-404 axios errors", async () => {
      const axiosError = new Error("Server Error");
      (axiosError as any).response = { status: 500 };
      mockAxiosCall.mockRejectedValue(axiosError);
      mockIsAxiosError.mockReturnValue(true);

      const req = mockReq({ "x-fhir-server-url": "https://fhir.example.com" });
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      await expect(FhirClientInstance.read(req, "Patient/1")).rejects.toThrow("Server Error");
      consoleSpy.mockRestore();
    });

    it("throws on non-axios errors", async () => {
      mockAxiosCall.mockRejectedValue(new Error("Network failure"));
      mockIsAxiosError.mockReturnValue(false);

      const req = mockReq({ "x-fhir-server-url": "https://fhir.example.com" });
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      await expect(FhirClientInstance.read(req, "Patient/1")).rejects.toThrow("Network failure");
      consoleSpy.mockRestore();
    });

    it("throws on axios error with no response property", async () => {
      const axiosError = new Error("Connection refused");
      mockAxiosCall.mockRejectedValue(axiosError);
      mockIsAxiosError.mockReturnValue(true);

      const req = mockReq({ "x-fhir-server-url": "https://fhir.example.com" });
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      await expect(FhirClientInstance.read(req, "Patient/1")).rejects.toThrow("Connection refused");
      consoleSpy.mockRestore();
    });

    it("logs non-object response data directly", async () => {
      mockAxiosCall.mockResolvedValue({ data: "plain-text-response", status: 200 });
      const req = mockReq({ "x-fhir-server-url": "https://fhir.example.com" });
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      const result = await FhirClientInstance.read(req, "Patient/1");
      expect(result).toBe("plain-text-response");
      // Verify the non-object branch of the ternary was hit
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("plain-text-response"));
      consoleSpy.mockRestore();
    });

    it("handles config with undefined method in logging", async () => {
      mockAxiosCall.mockResolvedValue({ data: { id: "1" }, status: 200 });
      const req = mockReq({ "x-fhir-server-url": "https://fhir.example.com" });
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      const result = await FhirClientInstance.read(req, "Patient/1");
      expect(result).toEqual({ id: "1" });
      consoleSpy.mockRestore();
    });

    it("logs full axios error details with statusText and data", async () => {
      const axiosError = new Error("Bad Request");
      (axiosError as any).response = {
        status: 400,
        statusText: "Bad Request",
        data: { issue: [{ diagnostics: "Invalid resource" }] },
      };
      mockAxiosCall.mockRejectedValue(axiosError);
      mockIsAxiosError.mockReturnValue(true);

      const req = mockReq({ "x-fhir-server-url": "https://fhir.example.com" });
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      await expect(FhirClientInstance.read(req, "Patient/1")).rejects.toThrow("Bad Request");
      // Verify both error log lines were called with full details
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("400 Bad Request"),
      );
      consoleSpy.mockRestore();
    });
  });

  describe("search", () => {
    it("searches FHIR resources with params", async () => {
      const bundle = { resourceType: "Bundle", entry: [] };
      mockAxiosCall.mockResolvedValue({ data: bundle });

      const req = mockReq({
        "x-fhir-server-url": "https://fhir.example.com",
        "x-fhir-access-token": "tok",
      });

      const result = await FhirClientInstance.search(req, "MedicationRequest", [
        "patient=Patient/123",
        "status=active",
      ]);
      expect(result).toEqual(bundle);
      expect(mockAxiosCall).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://fhir.example.com/MedicationRequest?patient=Patient/123&status=active",
        }),
      );
    });

    it("throws when no FHIR server URL header", async () => {
      const req = mockReq({});
      await expect(
        FhirClientInstance.search(req, "MedicationRequest", []),
      ).rejects.toThrow("X-FHIR-Server-URL header");
    });

    it("returns null on search error", async () => {
      mockAxiosCall.mockRejectedValue(new Error("Timeout"));
      mockIsAxiosError.mockReturnValue(false);

      const req = mockReq({ "x-fhir-server-url": "https://fhir.example.com" });
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      await expect(
        FhirClientInstance.search(req, "Observation", []),
      ).rejects.toThrow("Timeout");
      consoleSpy.mockRestore();
    });
  });
});
