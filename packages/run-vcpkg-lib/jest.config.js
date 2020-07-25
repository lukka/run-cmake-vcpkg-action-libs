module.exports = {
  clearMocks: true,
  moduleFileExtensions: ['js', 'ts'],
  roots: ['<rootDir>'],
  testEnvironment: 'node',
  testMatch: ['**/__tests__/*.test.ts'],
  testRunner: 'jest-circus/runner',
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  verbose: true,
  collectCoverage: true,
  coveragePathIgnorePattern: ["<rootDir>/build/", "<rootDir>/node_modules/"],
  // From: https://www.javascriptjanuary.com/blog/mocking-functionality-in-jest-at-different-scopes
  setupFilesAfterEnv: ['./__tests__/mocks.ts'],
}