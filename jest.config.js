module.exports = {
  clearMocks: true,
  moduleFileExtensions: ['ts', 'js'],
  roots: ['<rootDir>/packages'],
  testEnvironment: 'node',
  testMatch: ['**/__tests__/*.test.ts'],
  testRunner: 'jest-circus/runner',
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  verbose: true,
  collectCoverage: true,
  coveragePathIgnorePatterns: ["<rootDir>/build/", "<rootDir>/node_modules/", "<rootDir>/__tests__", "mocks.ts", '__tests__', "index.ts"],
  collectCoverageFrom: [
    "**/src/*.ts",
    "!**/node_modules/**",
    "!**/build/**"
  ]
}