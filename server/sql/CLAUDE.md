# server/sql/ — database conventions

## Files

| File | Purpose |
|---|---|
| `schema.sql` | Canonical, idempotent schema for fresh installs. **Always folded with every migration.** |
| `0001_add_task_events.sql` | task_events table |
| `0002_add_auth.sql` | profiles + handle_new_user trigger + tasks.assignee_id |
| `0003_admin_allowlist.sql` | allowed_emails + profiles.is_admin |
| `0004_add_waiting_for_reply_status.sql` | extends tasks.status check to allow 'waiting_for_reply' |

Numbering is monotonic — each new change gets the next integer. Don't renumber existing files.

## Tables (current)

- `projects(id, name, position, created_at)`
- `tasks(id, project_id↗, parent_task_id↗?, assignee_id↗?, name, description, status, due_date, completed_at, position, created_at, updated_at)`
- `tags(id, name uniq, color)`
- `task_tags(task_id↗, tag_id↗)` — composite PK
- `comments(id, task_id↗, body, created_at)`
- `task_events(id, task_id↗, kind, from_value, to_value, meta, created_at)`
- `profiles(id↗auth.users, email, display_name, avatar_url, is_admin, …)`
- `allowed_emails(id, email uniq, added_by↗?, created_at)`

`↗` = foreign key. `?` = nullable.

For relationships and visual layout, see [docs/data-model.md](../../docs/data-model.md).

## Migration rules

- **Idempotent**: every migration must safely re-run. Use `IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `ON CONFLICT DO NOTHING/UPDATE`, `DROP TRIGGER IF EXISTS` then `CREATE TRIGGER`.
- **Additive when possible**: prefer `ADD COLUMN … DEFAULT …` over destructive changes.
- **Fold into schema.sql** in the same PR. The canonical schema must always reflect the real DB.
- **Indexes**: add indexes for foreign keys you filter on, and for sort columns used in `ORDER BY` (e.g. `tasks.position`, `task_events.created_at desc`).
- **Triggers** for derived state only (e.g. `updated_at`, `handle_new_user` profile mirror). Business logic stays in the app layer.

## Bootstrapping admins

After `0003_admin_allowlist.sql`, run as a one-off:

```sql
insert into public.allowed_emails (email)
  values ('your.email@example.com')
  on conflict (email) do nothing;
update public.profiles set is_admin = true
  where lower(email) = lower('your.email@example.com');
```

After that, manage everyone else from the in-app Admin page.
