import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^next/link$": "<rootDir>/__mocks__/next-link.ts",
    "^next/navigation$": "<rootDir>/__mocks__/next-navigation.ts",
  },
};

export default config;
