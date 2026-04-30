-- Add per-task check-back date for waiting_for_reply follow-ups.
-- Idempotent: safe to re-run.

alter table tasks add column if not exists check_back_at date;

create index if not exists tasks_check_back_at_idx
  on tasks (check_back_at)
  where check_back_at is not null;
