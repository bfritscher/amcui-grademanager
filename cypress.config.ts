import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    specPattern: 'test/cypress/e2e/**/*.{cy,spec}.{js,jsx,ts,tsx}',
    baseUrl: 'http://localhost:4173',
    supportFile: 'test/cypress/support/e2e.ts',
  },
  downloadsFolder: 'test/cypress/downloads',
  fixturesFolder: 'test/cypress/fixtures',
  screenshotsFolder: 'test/cypress/screenshots',
  videosFolder: 'test/cypress/videos',
  video: true,
  viewportWidth: 1024,
  viewportHeight: 1080
});
