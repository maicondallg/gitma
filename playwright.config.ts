import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'ui/e2e',
  fullyParallel: false,
  use: { locale: 'pt-BR', baseURL: 'http://127.0.0.1:1420', viewport: { width: 1440, height: 900 } },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:1420', reuseExistingServer: !process.env.CI },
});
