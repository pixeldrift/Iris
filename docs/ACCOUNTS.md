# Accounts and sync

Lilac is local-first: the app always works from the data on the device, and signing in adds an account
that keeps that data in a Neon Postgres database so every device shows the same pond.

## How it fits together

- **Sign-in: Neon Auth** (managed Better Auth), email + password. The browser talks to the Neon Auth service
  directly through `@neondatabase/auth` (`src/sync/auth.ts`). Users and sessions live in Neon's `neon_auth`
  schema; nothing here is hand-rolled.
- **Calling our API:** the Neon Auth client hands the browser a short-lived **JWT** (EdDSA, about 15 minutes) with
  the session. Every sync request sends it as `Authorization: Bearer ...`; the server (`api/_lib/verify.ts`)
  checks the signature against the service's public keys (`<auth url>/.well-known/jwks.json`) and the issuer,
  and uses the token's `sub` as the user id.
- **Data: one `entities` table.** Every task, folder and person is a row holding its JSON, a client-stamped
  `updated_at`, a `deleted` tombstone flag and a server `seq`. See `db/schema.sql`.
- **Sync: `POST /api/sync`** (`api/sync.ts`, logic in `api/_lib/sync.ts`). A device sends the entities it changed
  since it last synced plus the last `seq` it saw; the server applies them (last write wins per entity, by the
  device's clock) and returns everything newer. The client side is `src/sync/` (`diff.ts` is pure and tested;
  `engine.ts` talks to the store and the network).
- **When it runs:** a moment after any edit, every 30 s, when the tab regains focus, and when the device comes
  back online. Offline edits are kept and sent later.
- **First sign-in on a device:** if the account is empty, this device's data is uploaded. If the account already
  has data, the built-in sample data here is dropped and the account's data comes down (anything you created on
  this device before signing in is still uploaded).
- **Signing out** removes the account's data from the device (it stays in the account) and restores the sample data.
- Settings (sound, view options, sidebar layout) stay per-device for now.

## One-time setup

1. In the Neon project, turn on **Auth** (done) and copy its **Auth URL**. Add your site's address
   (production, and any preview URLs you want to sign in on) to Neon Auth's allowed / trusted domains.
2. Create the data table: open the Neon SQL editor and run `db/schema.sql` (safe to re-run).
3. In the Vercel project's Environment Variables set `DATABASE_URL` (pooled), `VITE_NEON_AUTH_URL` and
   `NEON_AUTH_BASE_URL` (both the Auth URL). `VITE_NEON_AUTH_URL` is baked into the build, so redeploy after
   adding it. See `.env.example`.
4. Deploy. The "Sign in" pill appears at the top right of the sidebar once `VITE_NEON_AUTH_URL` is set.

## Trying it locally without Neon

`npm run dev:api` starts the real `/api/sync` handler on an in-memory Postgres plus a small **mock** of Neon Auth
(development only; plain-text passwords in memory). In another terminal:

    VITE_NEON_AUTH_URL=http://localhost:5173/api/auth npm run dev

The app on :5173 forwards `/api` to :3000. Data is lost when `dev:api` stops. To use the real service locally,
put the variables from `.env.example` in `.env.local` and run `vercel dev`.

## Known limits / next

- Last-write-wins uses the device clocks, so a badly wrong clock can win conflicts. Fine for one person's devices;
  revisit before collaboration (server-assigned versions or field-level merge).
- Email verification and password reset need Neon Auth's email settings (production needs custom SMTP).
  Passkeys / social sign-in are Neon Auth settings plus a button in `src/ui/Account.tsx`.
- Deleting an account in Neon Auth does not delete its `entities` rows yet.
- Reminders still fire only while the app is open; Web Push will use the account to store subscriptions.
