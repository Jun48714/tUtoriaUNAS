import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/api-editor-formatos.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  outputDir: '../artifacts/editor-formatos/playwright',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5174', browserName: 'chromium', trace: 'retain-on-failure' },
});
