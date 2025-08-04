/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests/unit'],
  testMatch: [
    '**/tests/unit/**/*.isolated.test.ts',
    '**/tests/unit/**/*.pure.test.ts',
    '**/src/**/__tests__/**/*.test.ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/services/kubernetes$': '<rootDir>/src/services/__mocks__/kubernetes.ts',
  },
  testTimeout: 15000, // Reduced timeout for faster CI
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
  verbose: false, // Less verbose for CI
  forceExit: true,
  detectOpenHandles: false, // Disabled for faster CI
  maxWorkers: 2, // Faster parallel execution
  // No setupFilesAfterEnv to avoid database dependencies
};