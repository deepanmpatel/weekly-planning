-- Add prioritized_position for the tag-driven Prioritized board (Work / Non-work split).
-- Seed the canonical 'work' tag idempotently.
-- Idempotent: safe to re-run.

alter table public.tasks
  add column if not exists prioritized_position int not null default 0;

create index if not exists tasks_prioritized_position_idx
  on public.tasks(prioritized_position);

insert into public.tags (name, color)
  values ('work', '#2563eb')
  on conflict (name) do nothing;
