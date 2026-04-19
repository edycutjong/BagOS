import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  transformIgnorePatterns: [
    "node_modules/(?!(jose|@bagsfm)/)",
  ],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: true }],
    "node_modules/(jose|@bagsfm)/.+\\.js$": ["ts-jest", { useESM: true }],
  },
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0,
    },
  },
};

export default config;
