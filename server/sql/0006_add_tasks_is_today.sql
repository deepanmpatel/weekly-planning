-- Add Today flag + independent ordering for the Today swim-lane board.
-- Idempotent: safe to re-run.

alter table tasks add column if not exists is_today boolean not null default false;
alter table tasks add column if not exists today_position int not null default 0;

create index if not exists tasks_is_today_idx on tasks (is_today) where is_today;
