import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout : ils pilotent l'application complète (web + API + base).
 * Prérequis : PostgreSQL démarré (Docker ou `pnpm infra:local`) et migrations appliquées.
 * La configuration démarre `pnpm dev` si l'application n'est pas déjà lancée.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'fr-FR',
    // Animations réduites : éléments stables pour les clics (et vérifie ce mode d'accessibilité).
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testMatch: /responsive|parent/ },
  ],
  webServer: {
    command: 'pnpm --dir ../.. dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
