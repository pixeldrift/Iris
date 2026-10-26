-- Lilac: Postgres (Neon) schema. Mirrors src/core/types.ts 1:1 so the web app,
-- the API and the future Swift app all share one model.
--
-- Sync strategy (planned): every row carries `updated_at` + `deleted_at` so a
-- client can push local changes and pull `WHERE updated_at > :cursor`
-- (last-write-wins per row is enough for a single-user to-do list).

create extension if not exists "pgcrypto";

create table if not exists users (
  id          uuid primary key default gen_random_uuid(),
  email       text unique not null,
  created_at  timestamptz not null default now()
);

create table if not exists folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  parent_id   uuid references folders(id) on delete set null,
  name        text not null,
  hue         smallint not null default 285,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists folders_user_idx on folders(user_id, updated_at);

create type task_kind   as enum ('task', 'idea', 'reminder');
create type task_status as enum ('todo', 'doing', 'done');

create table if not exists tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  title         text not null default '',
  notes         text not null default '',
  kind          task_kind not null default 'task',
  status        task_status not null default 'todo',
  -- soft 0..1 weights; the UI never shows numbers
  importance    real not null default 0.5 check (importance between 0 and 1),
  urgency       real not null default 0.3 check (urgency between 0 and 1),
  -- pond canvas position as a fraction of the canvas
  x             real not null default 0.5,
  y             real not null default 0.5,
  start_date    date,
  due_date      date,
  -- for push notifications (reminders)
  remind_at     timestamptz,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists tasks_user_idx on tasks(user_id, updated_at);
create index if not exists tasks_due_idx  on tasks(user_id, due_date) where deleted_at is null;

-- Tags are folders: a task can sit in many, a folder holds many.
create table if not exists task_folders (
  task_id    uuid not null references tasks(id) on delete cascade,
  folder_id  uuid not null references folders(id) on delete cascade,
  primary key (task_id, folder_id)
);
create index if not exists task_folders_folder_idx on task_folders(folder_id);

-- Everything under a folder (what "open this folder" shows):
--   with recursive sub as (
--     select id from folders where id = :folder
--     union all
--     select f.id from folders f join sub on f.parent_id = sub.id
--   )
--   select t.* from tasks t join task_folders tf on tf.task_id = t.id
--   where tf.folder_id in (select id from sub) and t.deleted_at is null;

-- Web push / APNs device tokens
create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  platform    text not null check (platform in ('webpush', 'apns')),
  endpoint    text not null,
  keys        jsonb,
  created_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);
