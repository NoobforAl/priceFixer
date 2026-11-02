/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests/unit'],
  testMatch: ['**/*.test.ts'],
  // Jest's defaults plus json-summary, which the PR coverage comment reads
  // (coverage/coverage-summary.json); lcov.info goes to Codecov.
  coverageReporters: ['json', 'json-summary', 'lcov', 'text', 'clover'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { types: ['chrome', 'jest'], module: 'commonjs' } }],
  },
};
