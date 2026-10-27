-- Lilac: Postgres (Neon) schema.
--
-- Run this once against your Neon database (Neon SQL editor, or: psql "$DATABASE_URL" -f db/schema.sql).
-- It is safe to run again.
--
-- 1. Accounts: the tables Better Auth needs (generated from the library itself).
-- 2. Data: every task, folder and person is one row in `entities` holding its JSON as the app has it.
--    That keeps the web app, the API and the future Swift app on a single model (src/core/types.ts)
--    without a migration for every new field. Sync is last-write-wins per entity.

-- ---------- accounts (Better Auth) ----------

create table if not exists "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table if not exists "session" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);

create table if not exists "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);

create table if not exists "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create index if not exists "session_userId_idx" on "session" ("userId");

create index if not exists "account_userId_idx" on "account" ("userId");

create index if not exists "verification_identifier_idx" on "verification" ("identifier");

-- ---------- data ----------

create sequence if not exists entities_seq;

create table if not exists entities (
  user_id     text    not null references "user" ("id") on delete cascade,
  kind        text    not null check (kind in ('task', 'folder', 'person')),
  id          text    not null,
  -- the entity as JSON; null once deleted (the row stays, as a tombstone, so other devices learn of it)
  data        jsonb,
  -- the client's clock (ms since epoch) when it last changed: the last-write-wins tiebreaker
  updated_at  bigint  not null,
  deleted     boolean not null default false,
  -- server order, bumped on every write: devices pull "everything after the last seq I saw"
  seq         bigint  not null default nextval('entities_seq'),
  primary key (user_id, kind, id)
);
create index if not exists entities_pull_idx on entities (user_id, seq);

-- Later: web push / APNs device tokens for reminders when the app is closed.
