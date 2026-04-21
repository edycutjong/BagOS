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
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
};

export default config;
