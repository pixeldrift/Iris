# Testing

- **`npm test`**: unit tests (Vitest) for the pure core (`src/core`), the sync diff and the API (on an in-memory
  Postgres). Fast; run them constantly.
- **`npm run test:e2e`**: browser tests (Playwright, `e2e/`) of the app the way a person uses it: pond, sidebar drags,
  views, pickers, reminders, settings, touch gestures on a phone-sized screen, and the account flows. The `app`
  project runs against the production build (`vite preview`); the `accounts` project also starts the local backend
  (`npm run dev:api`, a mock of Neon Auth plus the real API on PGlite) and the dev server pointed at it.
  First time on a machine: `npx playwright install chromium`. Set `PW_CHROMIUM=/path/to/chrome` to use an existing
  browser. On failure, traces are kept in `test-results/` (`npx playwright show-trace <trace.zip>`).
- **CI** (`.github/workflows/ci.yml`) runs typecheck, unit and browser tests on every push and pull request.

When a bug is found by hand, add the test that would have caught it next to the fix. (The custom-stage Progress
columns, for example, were found and fixed by the first run of `views.spec.ts`.)
