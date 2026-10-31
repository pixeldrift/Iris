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
- **When it runs:** a moment after any edit, when the app comes back into view, when the device comes back online,
  and on a timer. Offline edits are kept and sent later.
- **A "something changed" counter, so waiting is cheap.** Each workspace has a `head_seq` counter. Every write bumps
  it by one *in the same statement as the write*, so it is gapless and in commit order (that also removes the classic
  race where a reader skips a row that was still committing). A device that has pulled up to the head has seen
  everything. "Has anything changed?" is therefore one tiny read of that counter per workspace (`lightCheck` in
  `api/_lib/sync.ts`), compared with the cursor the device holds; only when a head is ahead does it do a full sync.
  A counter rather than a timestamp: it is monotonic, immune to clock skew, and is the cursor itself.
- **Presence, and a pace that adapts.** Every ~15 s a device also "beats": it checks in (the `devices` table) and
  learns how many *other* devices were open in the last minute (`peers`). Alone (app visible) a device asks every 15 s
  (45 s when hidden). With another device open at the same moment, both ask about once a second, and edits are sent
  within ~250 ms instead of 1.2 s, so a task added on the laptop drops into the phone's pond in about a second, with the
  water-drop sound and a ripple (`announceArrivals` in `src/sync/engine.ts`). The first device to notice the other can
  take up to one calm interval. The account menu shows "Also open on another device" while this is on.
  Cost while waiting: one primary-key read per check (about one per second per device in fast mode, none beyond the
  15 s beat otherwise); each check is still a function invocation, which real push (a managed realtime channel that
  just pings "workspace X changed") would remove later without changing anything else here.
- **Workspaces (groundwork for sharing).** Entities belong to a *workspace*, not a person: everyone has a personal
  workspace (its id is their user id), and `workspace_members` (owner / editor / viewer) is what sharing will use.
  The API already pulls every workspace you belong to with a cursor each, checks roles on writes (a viewer's writes
  are refused), tags each row with who last wrote it (`updated_by`) and how many times (`rev`), and counts
  collaborators' open devices as peers. What is missing is the UI and the invitation flow: see COLLABORATION.md.
- **First sign-in on a device:** if the account is empty, this device's data is uploaded. If the account already
  has data, the built-in sample data here is dropped and the account's data comes down (anything you created on
  this device before signing in is still uploaded).
- **Signing out** removes the account's data from the device (it stays in the account) and restores the sample data.
- **Clearing and deleting.** My settings > Your data has two destructive actions, each behind a confirmation that
  asks for the account's email and password again (a re-sign-in proves it; with no account on the device, clearing asks
  for a typed word instead). *Clear everything* empties tasks, groups and people (the deletions sync as tombstones, so
  every device follows). *Delete my account* calls `POST /api/account` (`api/account.ts`, `api/_lib/account.ts`): it removes
  the personal workspace and its entities, the device records, and then, best effort, the person's rows in the `neon_auth`
  schema (`session`, `account`, `user`), and the device returns to the signed-out starter data. If the login rows can't
  be removed (a differently named table), the data is still gone and the function log says why.
- **Demo data.** `src/core/seed.ts` holds the demo content (fixed `demo-` ids). My settings > Demo data adds it or
  removes it (anything of yours that still uses a demo group or person keeps it). The same content is the starting data.
- Settings (sound, view options, sidebar layout) stay per-device for now.

## Connections between people

Signed-in people can link address-book entries (`api/connect.ts`, `api/_lib/connect.ts`, client in `src/sync/connect.ts`,
dialogs in `src/ui/ConnectDialogs.tsx`). Adding someone with an email offers an invitation; the other person sees it under
the bell in the account menu and chooses what to share; on accept each entry is filled from the other's shared details.
Privacy: an invitation always looks the same to the sender, whether or not the address belongs to anyone; only a *verified*
email is matched (by a keyed hash), people can switch "findable" off in My Profile, requests are rate-limited, and the
server filters what each side receives by the fields they chose to share. Deleting an account removes its connections; the
other side's entry stays as an ordinary contact.

**To switch it on:** re-run `db/schema.sql` (new tables `profiles`, `connections`, `notifications`, `invite_attempts`), and
set `IDENTITY_SECRET` (any long random string) on the server. The caller's email comes from the Neon Auth JWT; a request is
only matchable when the token says the email is verified. If your Neon Auth tokens do not carry that claim, matching
stays off; set `IDENTITY_TRUST_EMAIL=1` to match on unverified emails while testing.

## One-time setup

1. In the Neon project, turn on **Auth** (done) and copy its **Auth URL**. Add your site's address
   (production, and any preview URLs you want to sign in on) to Neon Auth's allowed / trusted domains.
2. Create or upgrade the data tables: open the Neon SQL editor and run `db/schema.sql`. It is safe to re-run and it
   upgrades an older copy in place (existing data moves into each person's personal workspace). **Run it before
   deploying a version that needs it.**
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
