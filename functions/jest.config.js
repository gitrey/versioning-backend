module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts', // Typically exports and calls other functions
    '!src/config/**/*.ts', // Configuration files might not need unit tests
    '!src/model/**/*.ts', // Models are often data structures
    '!src/model-triggers/**/*.ts', // Triggers might be hard to unit test directly
    '!src/service/**/*.ts', // Services are often integrations
    '!src/**/__tests__/**/*.ts', // Exclude test files themselves
    '!src/**/__mocks__/**/*.ts', // Exclude mock files
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  testPathIgnorePatterns: ['/node_modules/', '/lib/'],
  moduleNameMapper: {
    '^@firebase/(.*)$': '<rootDir>/node_modules/@firebase/$1',
  },
  // Setup file to mock firebase-admin and firebase-functions
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
