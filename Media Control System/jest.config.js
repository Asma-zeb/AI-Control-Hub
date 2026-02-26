// Jest Configuration
module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    '**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/tests/**',
    '!**/server.js'
  ],
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/'
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },
  verbose: true,
  testTimeout: 10000,
  setupFilesAfterEnv: ['./tests/setup.js']
};
