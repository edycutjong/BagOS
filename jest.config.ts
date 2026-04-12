import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  transformIgnorePatterns: [
    "node_modules/(?!(jose)/)",
  ],
  transform: {
    "^.+\\.tsx?$": "ts-jest",
    "node_modules/jose/.+\\.js$": "ts-jest",
  },
  collectCoverageFrom: [
    "src/lib/**/*.ts",
    "src/tools/**/*.ts",
    "!src/index.ts",
    "!src/types/**/*.ts",
  ],
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
