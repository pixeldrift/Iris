-- Lilac: Postgres (Neon) schema.
--
-- Run this once against your Neon database (Neon SQL editor, or: psql "$DATABASE_URL" -f db/schema.sql).
-- It is safe to run again.
--
-- Accounts are Neon Auth (managed Better Auth): users and sessions live in Neon's own `neon_auth`
-- schema and are not created here. This file only adds the data tables.
--
-- Every task, folder and person is one row in `entities` holding its JSON as the app has it. That keeps the
-- web app, the API and the future Swift app on a single model (src/core/types.ts) without a migration for
-- every new field. Sync is last-write-wins per entity.

-- ---------- data ----------

create sequence if not exists entities_seq;

create table if not exists entities (
  -- the Neon Auth user id (the `sub` of their token)
  user_id     text    not null,
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
