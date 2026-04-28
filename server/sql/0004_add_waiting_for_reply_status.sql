-- Add 'waiting_for_reply' to the tasks.status check constraint.
-- Idempotent: drop the existing constraint by name, then re-add the expanded one.

alter table tasks drop constraint if exists tasks_status_check;
alter table tasks add constraint tasks_status_check
  check (status in ('todo','in_progress','waiting_for_reply','done'));
