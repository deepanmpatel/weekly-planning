# Data model

```
auth.users (Supabase-managed)
   │
   │ 1:1 trigger
   ▼
profiles (id, email, display_name, avatar_url, is_admin)
                                                  ▲
                                                  │ allowed_emails(email) gates which auth.users
                                                  │ can access data routes (matched by email, not FK)
                                                  │
projects (id, name, position)
   │ 1:N
   ▼
tasks (id, project_id↗, parent_task_id↗?, assignee_id↗profiles?,
       name, description, status, due_date, completed_at, position)
   │
   ├─── M:N ── task_tags ── tags (id, name, color)
   ├─── 1:N ── comments (id, task_id↗, body, created_at)
   └─── 1:N ── task_events (id, task_id↗, kind, from_value, to_value, meta, created_at)
```

## Subtasks

`tasks.parent_task_id` self-references. UI renders one level (top-level tasks have a subtask count badge; the drawer lists subtasks). The model supports deeper nesting if ever wanted.

## Status

`tasks.status` ∈ `('todo','in_progress','waiting_for_reply','done')`. CHECK constraint enforces. Setting status to `done` populates `completed_at`; setting to anything else clears it (handled in `PATCH /tasks/:id`). Display order on the kanban board: To-Do → In Progress → Waiting for Reply → Done.

## Position

`tasks.position` is a per-status integer that drives drag-and-drop priority order. Within a status column, tasks are sorted ASC by `position`, with `created_at` ASC as a tiebreaker. The All Tasks page also honors this — see [adr/0003-position-based-priority.md](adr/0003-position-based-priority.md).

## Profiles trigger

`handle_new_user()` runs `AFTER INSERT OR UPDATE ON auth.users` and upserts a row in `public.profiles`. This is how Google sign-in metadata (`name`, `avatar_url`, etc.) flows into the app's profile table without a separate sync job.

## Allowlist

`allowed_emails(email)` is the source of truth for "who can access data routes". `requireAllowed` middleware checks this on every request. Removing an email locks that user out on their next request.

`profiles.is_admin = true` grants access to `/admin/*` routes (manage allowlist, toggle admin on others). Cannot demote self (server- and UI-enforced).

## Activity events (task_events)

| Kind | Fired when |
|---|---|
| `created` | task inserted |
| `renamed` | name changed |
| `status_changed` | status changed |
| `due_date_changed` | due_date changed (cleared / set / shifted) |
| `description_changed` | description changed (logged without content) |
| `moved_project` | project_id changed |
| `reparented` | parent_task_id changed |
| `tag_added` / `tag_removed` | task_tags row inserted/deleted |
| `comment_added` | comment posted (to_value = first 140 chars) |
| `subtask_added` | new task with parent_task_id (logged on the parent) |
| `assigned` / `unassigned` | assignee_id changed |

When adding a new `EventKind`:

1. Add to the union in [server/src/events.ts](../server/src/events.ts).
2. Mirror the union in [web/src/lib/types.ts](../web/src/lib/types.ts).
3. Add icon + render branch in [web/src/components/Activity.tsx](../web/src/components/Activity.tsx).

## Indexes (current)

- `tasks(project_id)`, `tasks(parent_task_id)`, `tasks(status)`, `tasks(assignee_id)`
- `task_events(task_id, created_at desc)`
- `allowed_emails(lower(email))`
- All primary keys + unique constraints (implicit indexes).
