import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest/presets/default-esm",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  transformIgnorePatterns: [
    "node_modules/(?!(jose|@bagsfm)/)",
  ],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: true, tsconfig: { isolatedModules: true } }],
    "node_modules/(jose|@bagsfm)/.+\\.js$": ["ts-jest", { useESM: true }],
  },
  // Test infrastructure (mock factories in src/__tests__/helpers.ts) is not
  // production code and must not sit in the coverage denominator — measuring
  // it inflates nothing and demands tests-for-tests. Config correctness fix,
  // not coverage padding.
  coveragePathIgnorePatterns: ["/node_modules/", "<rootDir>/src/__tests__/"],
  // The README claims 100% coverage is enforced. It says "enforced", so the gate has to
  // actually be 100 — a claim of 100 backed by a 90/95 threshold is true only by accident
  // and stops being true the first time someone lands an untested branch.
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
};

export default config;
