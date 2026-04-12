import { NullUtilities } from "../../lib/null-utilities";

describe("NullUtilities", () => {
  describe("getOrThrow", () => {
    it("returns value when not null", () => {
      expect(NullUtilities.getOrThrow("hello", "Error")).toBe("hello");
    });

    it("returns value when truthy object", () => {
      const obj = { foo: "bar" };
      expect(NullUtilities.getOrThrow(obj, "Error")).toBe(obj);
    });

    it("throws on null", () => {
      expect(() => NullUtilities.getOrThrow(null, "Was null")).toThrow("Was null");
    });

    it("throws on undefined", () => {
      expect(() => NullUtilities.getOrThrow(undefined, "Was undefined")).toThrow("Was undefined");
    });

    it("throws with default message", () => {
      expect(() => NullUtilities.getOrThrow(null)).toThrow("Unexpected null reference");
    });

    it("throws on empty string (falsy)", () => {
      expect(() => NullUtilities.getOrThrow("", "Empty")).toThrow("Empty");
    });

    it("throws on zero (falsy)", () => {
      expect(() => NullUtilities.getOrThrow(0, "Zero")).toThrow("Zero");
    });
  });
});
