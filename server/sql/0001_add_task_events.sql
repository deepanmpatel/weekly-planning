-- Run this once if you seeded BEFORE the task history feature existed.
-- Safe to re-run (uses IF NOT EXISTS).

create table if not exists task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  kind text not null,
  from_value text,
  to_value text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_events_task_id_idx on task_events(task_id, created_at desc);
