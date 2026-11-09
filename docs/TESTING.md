# Testing

- **`npm test`**: unit tests (Vitest) for the pure core (`src/core`), the sync diff and the API (on an in-memory
  Postgres). Fast; run them constantly.
- **`npm run test:smoke`** (about a minute and a half): unit tests plus 18 browser tests tagged `@smoke`, one or two for each major area (adding and ticking, the pond, list, board, calendar, space and flat, dialogs, people, settings). Enough to know nothing big broke.
- **`npm run test:area -- space`** (or `pond`, `list`, `board`, `calendar`, `panel`, `settings`, `people`, `ui`): only the browser tests for the part you are working on. **`npm run test:area -- --changed`** picks the areas from the files you have changed since `main`. Add `--slow` to include the slow ones.
- **`npm run test:fast`**: everything except the tests tagged `@slow` (the pop game, the play limit, 300 tasks, the every-view text-selection sweep, the calendar scroll mechanics).
- **`npm run test:e2e`**: the whole browser suite, nothing skipped: before a release or a change that reaches everywhere (the stylesheet, shared components). Browser tests (Playwright, `e2e/`) of the app the way a person uses it: pond, sidebar drags,
  views, pickers, reminders, settings, touch gestures on a phone-sized screen, and the account flows. The `app`
  project runs against the production build (`vite preview`); the `accounts` project also starts the local backend
  (`npm run dev:api`, a mock of Neon Auth plus the real API on PGlite) and the dev server pointed at it.
  First time on a machine: `npx playwright install chromium`. Set `PW_CHROMIUM=/path/to/chrome` to use an existing
  browser. On failure, traces are kept in `test-results/` (`npx playwright show-trace <trace.zip>`).
- **CI** (`.github/workflows/ci.yml`) runs typecheck, unit and browser tests on every push and pull request.

When a bug is found by hand, add the test that would have caught it next to the fix. (The custom-stage Progress
columns, for example, were found and fixed by the first run of `views.spec.ts`.)

## How much to run, and when

- While refining a feature: unit tests (they take seconds) plus `test:area` for that area. Nothing else.
- Before merging: `test:smoke`, plus `test:area --changed`.
- Full `test:e2e`: before a release, or when a change is cross-cutting (design tokens, shared components, dialogs).
- Tests are for behaviour people rely on (a drag lands where it should, a tap saves, a setting is kept). Checks of exact looks (a line's colour, which way a small arrow points, how a month name is spelled out when there is room) are not kept: they only fail when the design changes, which is when you do not want a test to argue.
- `e2e/dayschedule.spec.ts` has two tests marked `fixme`: they click at fixed positions in a day that scrolls to the current time, so they fail in the afternoon. They need rewriting to find their own spot before they come back.
