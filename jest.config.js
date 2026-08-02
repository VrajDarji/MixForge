/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  // Temporary bootstrap accommodation: no src/**/*.test.ts files exist yet (Task 5+ adds
  // the first real tests). Remove this once real tests land so Jest discovering 0 tests
  // fails CI instead of silently passing.
  passWithNoTests: true,
};
