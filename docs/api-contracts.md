# API contracts

All routes (except `/health`) require `Authorization: Bearer <supabase_access_token>`.

| Gate | Effect |
|---|---|
| `requireAuth` | Verifies JWT; populates `req.user`. |
| `requireAllowed` | 403 if email not in `allowed_emails` (or user not admin). |
| `requireAdmin` | 403 if `profiles.is_admin !== true`. |

Mounting order in [server/src/app.ts](../server/src/app.ts):

```
requireAuth
  ├─ /users (no allowlist gate)
  ├─ /admin (requireAdmin inside)
requireAllowed
  ├─ /projects, /tasks, /tasks/:taskId/comments, /tags
```

## Health

```
GET  /health → 200 {ok:true}
```

## Projects

```
GET    /projects                       → Project[] with task_count, done_count
POST   /projects {name}                → 201 Project
PATCH  /projects/:id {name?, position?}→ 200 Project
DELETE /projects/:id                   → 204
GET    /projects/:id/tasks             → Task[] (top-level, with subtasks[] nested 1 level, tags inline)
PUT    /projects/:id/tasks/order       → 204
       body: {status, ordered_ids: string[]}
       Reassigns position 0..N within the status column. Constrained by project_id+status.
```

## Tasks

```
GET    /tasks                          → Task[] with project_name, tags, assignee
                                          (sorted by project_id, position, created_at)
GET    /tasks/:id                      → Task with subtasks[], comments[], events[], tags, assignee
POST   /tasks {project_id, parent_task_id?, name, description?, status?, due_date?, assignee_id?}
                                       → 201 Task
PATCH  /tasks/:id {name?, status?, due_date?, description?, project_id?, parent_task_id?, assignee_id?, position?}
                                       → 200 Task (auto-sets completed_at on status=done)
DELETE /tasks/:id                      → 204
POST   /tasks/:id/tags {tag_id}        → 204
DELETE /tasks/:id/tags/:tagId          → 204
```

## Comments

```
GET    /tasks/:taskId/comments         → Comment[]
POST   /tasks/:taskId/comments {body}  → 201 Comment (logs comment_added event)
DELETE /tasks/:taskId/comments/:id     → 204
```

## Tags

```
GET    /tags                           → Tag[]
POST   /tags {name, color?}            → 201 Tag (or 200 existing if name conflict)
DELETE /tags/:id                       → 204
```

## Users

```
GET    /users                          → Profile[] (all users; for assignee picker + admin page)
GET    /users/me                       → Profile + {is_admin, is_allowed}
                                          (does NOT require allowlist — denied users still see this)
```

## Admin (requireAdmin)

```
GET    /admin/allowed-emails                       → AllowedEmail[]
POST   /admin/allowed-emails {email}               → 201 AllowedEmail (409 if duplicate)
DELETE /admin/allowed-emails/:id                   → 204
PATCH  /admin/users/:id {is_admin}                 → 200 Profile (400 cannot_demote_self)
```

## Response conventions

- 201 Created: returns the new resource body
- 204 No Content: empty body
- 400 Bad Request: `{error: <Zod flatten>}` for body validation, `{error: "cannot_demote_self"}` for invariants
- 401 Unauthorized: `{error: "unauthenticated" | "invalid token"}`
- 403 Forbidden: `{error: "not_allowed" | "admin_required"}` (sometimes with a `message`)
- 404 Not Found: `{error: <db error message>}`
- 409 Conflict: `{error: "already_allowed"}`
- 500 Internal: `{error: <message>}`

## Event auto-logging

Mutating endpoints insert into `task_events` after the DB write succeeds. New event kinds → see [data-model.md](data-model.md).
