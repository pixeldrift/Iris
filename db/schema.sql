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

create table if not exists workspaces (
  id          text primary key,
  name        text not null default '',
  personal    boolean not null default false,
  -- The "something changed" counter. Every write in the workspace bumps it by one, in the same statement as the
  -- write, so it is gapless and in commit order. A device that has read up to `head_seq` has seen everything, and
  -- "has anything changed?" is one tiny primary-key read: compare head_seq with the cursor you hold.
  head_seq    bigint not null default 0,
  created_at  timestamptz not null default now()
);
alter table workspaces add column if not exists head_seq bigint not null default 0;

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
  -- this workspace's head_seq at the time of the write: devices pull "everything after the last seq I saw"
  seq           bigint  not null,
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

-- Earlier copies numbered writes from one global sequence; make each workspace's counter start above what it has.
update workspaces w set head_seq = greatest(w.head_seq, coalesce((select max(e.seq) from entities e where e.workspace_id = w.id), 0));

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

-- ---------------------------------------------------------------------------------------------------------------------
-- Connections: people who use Lilac linking their address-book entries, each choosing what to share.
--
-- Privacy rules the code relies on:
--   * Nobody can learn whether an email belongs to a Lilac user. An invitation always looks the same to the sender;
--     only an accepted one ever shows anything. Declined and blocked requests look like pending ones.
--   * Only a *verified* email can be matched, and a person can switch "findable" off.
--   * Emails are matched by a keyed hash (email_hash), not looked up in plain text.
--   * What the other side sees is filtered on the server by the fields each person chose to share.

create table if not exists profiles (
  user_id     text primary key,
  email       text not null default '',
  email_hash  text not null default '',
  verified    boolean not null default false,
  -- "Let people who have my email find me": off means invitations to this address never reach them
  findable    boolean not null default true,
  -- the details this person can offer: first, last, phone, email, address (+ street, city, state, zip), birthday
  details     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
create index if not exists profiles_email_hash_idx on profiles (email_hash);

create table if not exists connections (
  id           text primary key,
  -- a asked, b was asked
  a_user       text not null,
  b_user       text not null,
  -- pending | accepted | declined | blocked | ended
  status       text not null default 'pending',
  ended_by     text,
  a_shares     text[] not null default '{}',
  b_shares     text[] not null default '{}',
  -- the address-book entry on each side that this connection fills in
  a_person_id  text,
  b_person_id  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (a_user, b_user)
);
create index if not exists connections_b_idx on connections (b_user);

create table if not exists notifications (
  id             text primary key,
  user_id        text not null,
  -- request | accepted
  kind           text not null,
  connection_id  text,
  from_user      text,
  read           boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);

-- every invitation attempt, matched or not, so asking about many addresses can be slowed down
create table if not exists invite_attempts (
  user_id  text not null,
  at       timestamptz not null default now()
);
create index if not exists invite_attempts_idx on invite_attempts (user_id, at);
