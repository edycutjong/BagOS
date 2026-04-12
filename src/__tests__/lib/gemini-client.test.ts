// Mock the @google/genai module
jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: jest.fn(),
    },
  })),
}));

describe("GeminiClient", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, GEMINI_API_KEY: "test-key-123" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws when GEMINI_API_KEY is not set", () => {
    delete process.env["GEMINI_API_KEY"];
    expect(() => {
      // Force re-import to trigger constructor
      jest.isolateModules(() => {
        const { getGeminiClient } = require("../../lib/gemini-client");
        getGeminiClient();
      });
    }).toThrow("GEMINI_API_KEY environment variable is required");
  });

  it("generates an appeal letter successfully", async () => {
    const mockResponse = { text: "Dear Medical Director,\n\nI am writing to appeal..." };

    jest.isolateModules(async () => {
      const { GoogleGenAI } = require("@google/genai");
      GoogleGenAI.mockImplementation(() => ({
        models: {
          generateContent: jest.fn().mockResolvedValue(mockResponse),
        },
      }));

      const { getGeminiClient } = require("../../lib/gemini-client");
      const client = getGeminiClient();
      const result = await client.generateAppeal({
        patientSummary: "Patient: Test User, DOB: 2000-01-01",
        denialReason: "Step therapy not met",
        medicationName: "Humira",
        fhirResources: "- Patient/123: Test User",
      });
      expect(result).toContain("Dear Medical Director");
    });
  });

  it("throws when Gemini returns empty response", async () => {
    jest.isolateModules(async () => {
      const { GoogleGenAI } = require("@google/genai");
      GoogleGenAI.mockImplementation(() => ({
        models: {
          generateContent: jest.fn().mockResolvedValue({ text: null }),
        },
      }));

      const { getGeminiClient } = require("../../lib/gemini-client");
      const client = getGeminiClient();
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      await expect(
        client.generateAppeal({
          patientSummary: "Test",
          denialReason: "Test",
          medicationName: "Test",
          fhirResources: "Test",
        }),
      ).rejects.toThrow("Gemini returned empty response");
      consoleSpy.mockRestore();
    });
  });

  it("throws on API error", async () => {
    jest.isolateModules(async () => {
      const { GoogleGenAI } = require("@google/genai");
      GoogleGenAI.mockImplementation(() => ({
        models: {
          generateContent: jest.fn().mockRejectedValue(new Error("Rate limited")),
        },
      }));

      const { getGeminiClient } = require("../../lib/gemini-client");
      const client = getGeminiClient();
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      await expect(
        client.generateAppeal({
          patientSummary: "Test",
          denialReason: "Test",
          medicationName: "Test",
          fhirResources: "Test",
        }),
      ).rejects.toThrow("Failed to generate appeal: Rate limited");
      consoleSpy.mockRestore();
    });
  });

  it("handles non-Error thrown by API", async () => {
    jest.isolateModules(async () => {
      const { GoogleGenAI } = require("@google/genai");
      GoogleGenAI.mockImplementation(() => ({
        models: {
          generateContent: jest.fn().mockRejectedValue("string error"),
        },
      }));

      const { getGeminiClient } = require("../../lib/gemini-client");
      const client = getGeminiClient();
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      await expect(
        client.generateAppeal({
          patientSummary: "Test",
          denialReason: "Test",
          medicationName: "Test",
          fhirResources: "Test",
        }),
      ).rejects.toThrow("Failed to generate appeal: Unknown error");
      consoleSpy.mockRestore();
    });
  });

  it("uses custom model from environment", () => {
    process.env["GEMINI_MODEL"] = "gemini-1.5-pro";
    jest.isolateModules(() => {
      const { getGeminiClient } = require("../../lib/gemini-client");
      const client = getGeminiClient();
      expect(client).toBeDefined();
    });
  });

  it("returns singleton instance", () => {
    jest.isolateModules(() => {
      const { getGeminiClient } = require("../../lib/gemini-client");
      const a = getGeminiClient();
      const b = getGeminiClient();
      expect(a).toBe(b);
    });
  });
});
