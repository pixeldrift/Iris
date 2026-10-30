import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests: the app as a person uses it (drag and drop, pickers, settings, accounts).
 *
 *   npm run test:e2e
 *
 * `app` tests run against the production build served by `vite preview`. `accounts` tests also start the local
 * backend (`npm run dev:api`: the real API on an in-memory Postgres with a mock of Neon Auth) and the dev server
 * pointed at it. Set PW_CHROMIUM to use an existing Chromium binary instead of Playwright's own download.
 */
const executablePath = process.env.PW_CHROMIUM || undefined
const use = { launchOptions: { executablePath }, trace: 'retain-on-failure' as const }

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: 1,
  reporter: process.env.CI ? 'github' : 'list',
  projects: [
    { name: 'app', testIgnore: /accounts\.spec\.ts/, use: { ...devices['Desktop Chrome'], ...use, baseURL: 'http://localhost:4173', viewport: { width: 1200, height: 900 } } },
    { name: 'accounts', testMatch: /accounts\.spec\.ts/, fullyParallel: false, use: { ...devices['Desktop Chrome'], ...use, baseURL: 'http://localhost:5173', viewport: { width: 1200, height: 900 } } },
  ],
  webServer: [
    { command: 'npm run build && npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 180_000 },
    { command: 'npm run dev:api', url: 'http://localhost:3000/api/auth/get-session', reuseExistingServer: true, timeout: 60_000 },
    { command: 'npx vite --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000, env: { VITE_NEON_AUTH_URL: 'http://localhost:5173/api/auth' } },
  ],
})
