-- Lilac: Postgres (Neon) schema.
--
-- Run this against your Neon database (Neon SQL editor, or: psql "$DATABASE_URL" -f db/schema.sql).
-- It is safe to run again, and it upgrades an older copy of itself in place.
--
-- Accounts are Neon Auth (managed Better Auth): users and sessions live in Neon's own `neon_auth` schema.
-- This file holds Lilac's data.
--
-- Everything that syncs is an *entity* (a task, group or person) stored as its JSON in `entities`, so the web
-- app, the API and the future Swift app share one model (src/core/types.ts) without a migration per field.
--
-- Entities belong to a WORKSPACE, not to a person. Everyone has a personal workspace (its id is their user
-- id); sharing is "add someone to a workspace" (`workspace_members`). Sync pulls every workspace you belong to.
-- That is the groundwork for several people contributing to the same tasks and groups.

create sequence if not exists entities_seq;

create table if not exists workspaces (
  id          text primary key,
  name        text not null default '',
  personal    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists workspace_members (
  workspace_id  text not null references workspaces (id) on delete cascade,
  user_id       text not null,
  -- owner: everything; editor: add and change; viewer: read only
  role          text not null default 'owner' check (role in ('owner', 'editor', 'viewer')),
  added_at      timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_members_user_idx on workspace_members (user_id);

create table if not exists entities (
  workspace_id  text    not null references workspaces (id) on delete cascade,
  kind          text    not null check (kind in ('task', 'folder', 'person')),
  id            text    not null,
  -- the entity as JSON; null once deleted (the row stays, as a tombstone, so other devices learn of it)
  data          jsonb,
  -- the writer's clock (ms since epoch): the last-write-wins tiebreaker for now
  updated_at    bigint  not null,
  -- who wrote it, and how many times it has been written (for attribution and, later, real merging)
  updated_by    text,
  rev           bigint  not null default 1,
  deleted       boolean not null default false,
  -- server order, bumped on every write: devices pull "everything after the last seq I saw" per workspace
  seq           bigint  not null default nextval('entities_seq'),
  primary key (workspace_id, kind, id)
);

-- Upgrade from the first version of this schema, where entities had a user_id instead of a workspace.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = current_schema() and table_name = 'entities' and column_name = 'user_id') then
    alter table entities add column if not exists workspace_id text;
    alter table entities add column if not exists updated_by text;
    alter table entities add column if not exists rev bigint not null default 1;
    insert into workspaces (id, name, personal) select distinct user_id, '', true from entities on conflict do nothing;
    insert into workspace_members (workspace_id, user_id, role) select distinct user_id, user_id, 'owner' from entities on conflict do nothing;
    update entities set workspace_id = user_id, updated_by = user_id where workspace_id is null;
    alter table entities alter column workspace_id set not null;
    alter table entities drop constraint if exists entities_pkey;
    alter table entities add primary key (workspace_id, kind, id);
    alter table entities drop column user_id;
  end if;
end $$;

create index if not exists entities_pull_idx on entities (workspace_id, seq);

-- Which devices are open right now (a device that checked in with the app visible in the last minute). Sync uses it
-- to poll quickly only while two or more are active at once, and it is what "who is here" will be built on.
create table if not exists devices (
  user_id    text not null,
  device_id  text not null,
  label      text not null default '',
  last_seen  timestamptz not null default now(),
  primary key (user_id, device_id)
);

-- Later: web push / APNs device tokens for reminders when the app is closed; invitations for workspaces.
