import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './',
  timeout: 30_000,
  use: {
    baseURL: 'https://localhost:4001',
    headless: true,
    ignoreHTTPSErrors: true,
  },
});
