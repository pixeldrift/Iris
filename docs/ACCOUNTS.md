# Accounts and sync

Lilac is local-first: the app always works from the data on the device, and signing in adds an account
that keeps that data in a Neon Postgres database so every device shows the same pond.

## How it fits together

- **Sign-in: [Better Auth](https://www.better-auth.com)** (email + password), running as Vercel functions at
  `/api/auth/*`. Users, sessions and password hashes live in the same Neon database. Sessions are httpOnly
  cookies on the app's own origin. (Nothing here is hand-rolled crypto.)
- **Data: one `entities` table.** Every task, folder and person is a row holding its JSON, a
  client-stamped `updated_at`, a `deleted` tombstone flag and a server `seq`. See `db/schema.sql`.
- **Sync: `POST /api/sync`** (`api/sync.ts`, logic in `api/_lib/sync.ts`). A device sends the entities it
  changed since it last synced plus the last `seq` it saw; the server applies them (last write wins per
  entity, by the device's clock) and returns everything newer than that `seq`. The client side is
  `src/sync/` (`diff.ts` is pure and tested; `engine.ts` talks to the store and the network).
- **When it runs:** a moment after any edit, every 30 s, when the tab regains focus, and when the device
  comes back online. Offline edits are kept and sent later.
- **First sign-in on a device:** if the account is empty, this device's data is uploaded. If the account
  already has data, the built-in sample data here is dropped and the account's data comes down (anything
  you created on this device before signing in is still uploaded).
- **Signing out** removes the account's data from the device (it stays in the account) and restores the
  sample data.
- Settings (sound, view options, sidebar layout) stay per-device for now.

## One-time setup

1. In Vercel, add a **Neon** database to the project (Storage tab, or the Neon integration). Copy its
   **pooled** connection string.
2. Create the tables: open the Neon SQL editor and run `db/schema.sql` (it can be re-run safely), or
   `psql "$DATABASE_URL" -f db/schema.sql`.
3. In the Vercel project's Environment Variables set `DATABASE_URL`, `BETTER_AUTH_SECRET`
   (`openssl rand -base64 32`) and `BETTER_AUTH_URL` (the production address). See `.env.example`.
4. Deploy. The "Sign in to sync" row appears at the bottom of the sidebar once `/api/auth/ok` answers.

## Trying it locally

- **No database needed:** `npm run dev:api` (an in-memory Postgres plus the same handlers, on :3000) and,
  in another terminal, `npm run dev`. The app on :5173 forwards `/api` to it. Data is lost when `dev:api` stops.
- **Against Neon:** put the three variables in `.env.local` and run `vercel dev`.

## Known limits / next

- Last-write-wins uses the device clocks, so a badly wrong clock can win conflicts. Fine for one person's
  devices; revisit before collaboration (server-assigned versions or field-level merge).
- Better Auth's rate limiting is per function instance on serverless; add a shared store before opening
  sign-up widely.
- No email verification or password reset yet (needs an email provider). Passkeys and social sign-in are
  one-line additions in `api/_lib/auth.ts` when wanted.
- Reminders still fire only while the app is open; Web Push will use the account to store subscriptions.
