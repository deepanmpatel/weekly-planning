# server/ — backend conventions

Express + TS + Zod + supabase-js (service-role). This workspace runs locally on `:3001` and is also the body of the Vercel function (re-exported by `/api/index.ts`).

## File map

```
src/
├── app.ts             ← Express bootstrap; mount routers here
├── auth.ts            ← requireAuth / requireAllowed / requireAdmin
├── events.ts          ← logEvent / logEvents + EventKind union
├── supabase.ts        ← service-role client (throws if env missing)
├── schemas.ts         ← shared Zod schemas (statusEnum, taskCreate, taskUpdate, …)
└── routes/
    ├── projects.ts    ← /projects + /projects/:id/tasks + /projects/:id/tasks/order
    ├── tasks.ts       ← /tasks (list + CRUD + tag attach/detach)
    ├── comments.ts    ← /tasks/:taskId/comments
    ├── tags.ts        ← /tags
    ├── users.ts       ← /users (no allowlist gate — see app.ts)
    └── admin.ts       ← /admin (requireAdmin)

sql/
├── schema.sql         ← canonical, idempotent. Run for fresh installs.
├── 0001_…sql etc.     ← numbered migrations. Each idempotent. Number = order applied.
└── (folded into schema.sql for fresh installs)

scripts/seed.ts        ← one-shot CSV importer. Bails if projects table non-empty.
```

## Middleware order in app.ts (do not reorder casually)

```
requireAuth                    ← every route
  ├── /users   (no allowlist — denied users must read /me)
  └── /admin   (requireAdmin inside the router)
requireAllowed                 ← gate everything below
  ├── /projects
  ├── /tasks
  ├── /tasks/:taskId/comments
  └── /tags
```

## Patterns to follow

- **ESM with `.js` suffix** on every internal import (`import { x } from "./y.js"`). Required by Node ESM even though source is `.ts`.
- **Validate every body** with Zod's `safeParse` → 400 with `parsed.error.flatten()` on failure. Never trust the request.
- **Status codes**: 200 read, 201 create-with-body, 204 no-body, 400 validation, 401 auth, 403 forbidden, 404 not-found, 409 conflict, 500 unexpected.
- **Avoid N+1**: batch with `.in("col", ids)` then build a `Map`. See `attachTagsMany` and `fetchAssigneeMap` in [routes/tasks.ts](src/routes/tasks.ts).
- **Activity events**: any task field change must call `logEvent`/`logEvents` after a successful update. New event kinds → extend `EventKind` in [events.ts](src/events.ts) AND mirror in [web/src/lib/types.ts](../web/src/lib/types.ts).
- **Project_id + status guards on writes** that take a task id (defense against cross-project mutation). See `PUT /projects/:id/tasks/order` in [routes/projects.ts](src/routes/projects.ts). The Today reorder (`PUT /tasks/today/reorder`) additionally guards on `is_today=true`.
- **TZ-anchored cutoffs** (e.g. "before today's PT midnight") use `Intl.DateTimeFormat` to derive the offset rather than hard-coding it. See `todayPtMidnightUtcIso()` in [routes/tasks.ts](src/routes/tasks.ts) — mirror the algorithm in [web/src/lib/demo/demoStore.ts](../web/src/lib/demo/demoStore.ts) when reusing.
- **No comments** unless the *why* is non-obvious.

## Migrations

- New change → write `sql/000N_<name>.sql` AND fold into `sql/schema.sql`.
- Use `IF NOT EXISTS`, `CREATE OR REPLACE`, `ON CONFLICT DO NOTHING/UPDATE`.
- See [sql/CLAUDE.md](sql/CLAUDE.md) for the table list and migration log.

## Build

```bash
npm --workspace asana-server run build   # tsc, must pass clean
```

## Don't

- Don't expose the service-role client to anything that reaches the browser.
- Don't add new event kinds without updating the frontend type.
- Don't bypass `requireAuth` / `requireAllowed` / `requireAdmin` for data routes.
- Don't write migrations that aren't idempotent.
