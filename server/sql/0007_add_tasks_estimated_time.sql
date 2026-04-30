-- Add per-task time estimate: numeric value + unit (hours|days).
-- Idempotent: safe to re-run.

alter table tasks add column if not exists estimated_time numeric(8,2);
alter table tasks add column if not exists estimated_time_unit text not null default 'hours';

do $$ begin
  alter table tasks
    add constraint tasks_estimated_time_unit_check
    check (estimated_time_unit in ('hours','days'));
exception when duplicate_object then null; end $$;
