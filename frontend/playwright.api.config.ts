import { defineConfig } from '@playwright/test';

const origenAislado = process.env.TUTORIA_E2E_ORIGIN;
if (origenAislado && !/^http:\/\/127\.0\.0\.1:\d+$/.test(origenAislado)) {
  throw new Error('TUTORIA_E2E_ORIGIN debe apuntar al servidor local de pruebas.');
}

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/api-*.spec.ts',
  workers: 1,
  retries: 0,
  outputDir: '../artifacts/persistencia-api/playwright',
  reporter: 'list',
  use: {
    baseURL: origenAislado || 'http://127.0.0.1:5173',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: origenAislado
    ? undefined
    : {
        command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173',
        url: 'http://127.0.0.1:5173',
        env: { VITE_DATA_SOURCE: 'api' },
        reuseExistingServer: true,
      },
});
