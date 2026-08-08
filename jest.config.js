/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/test-data/**/*.test.ts', '<rootDir>/apps/**/*.test.ts'],
};
