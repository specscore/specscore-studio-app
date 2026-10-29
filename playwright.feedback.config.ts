import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './apps/app-e2e/src', testMatch: 'feedback.spec.ts',
  workers: 1, retries: 0, timeout: 30_000, reporter: [['list']],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
});
