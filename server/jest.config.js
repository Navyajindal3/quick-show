module.exports = {
  testEnvironment: 'node',
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit.test.js'],
      testEnvironment: 'node',
      testTimeout: 15000,
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/booking.test.js'],
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      testTimeout: 60000,
    },
  ],
};
