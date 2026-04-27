# web/src/lib/demo/ — demo-mode in-memory backend

This directory is a **second backend** that runs in the browser when `VITE_DEMO_MODE=true`. It must mirror the real Express API at [server/src/](../../../../server/src/) **endpoint-for-endpoint, shape-for-shape**. If it drifts, demo mode breaks silently (the UI either does nothing or pretends to succeed and snaps back).

## Files

- `demoMode.ts` (parent dir) — exports `DEMO_MODE` flag, true when `VITE_DEMO_MODE=true`.
- `demoData.ts` — seed data. Mirrors the column shape of every table you'd find in Supabase Postgres (projects, tasks, tags, profiles, allowed_emails, comments, task_events).
- `demoStore.ts` — handler table dispatched by `demoFetch(path, init)`. `web/src/lib/api.ts` short-circuits to this when `DEMO_MODE` is true.

## Rules — read before editing the real API

1. **Every Express route in [server/src/routes/](../../../../server/src/routes/) MUST have a matching handler here.** When you add a new route, add the demo handler in the same change. Same when you rename, change methods, change request body shapes, or add fields.
2. **Response shapes must match.** If the Express route returns `Task & { tags, assignee, project_name }`, the demo handler must too. Type-check by building (`npm --workspace asana-web run build`).
3. **Status semantics matter.** Express returns 204 with no body on most mutations; demo handlers return `undefined` (which the `clone()` helper short-circuits — see existing handlers).
4. **Activity events must mirror.** If a real route calls `logEvent({ kind: "status_changed", ... })`, the demo handler must call its local `logEvent` with the same arguments. UI behavior (Activity timeline) depends on this.
5. **No backend-only deps in demo handlers.** No `supabase-js`, no `node:*`, no env vars. The demo store runs in the browser.
6. **Cascade rules must mirror.** If `DELETE /projects/:id` cascades to tasks/comments/events on the server (FK), the demo handler must replicate the cascade in arrays.
7. **Validation is loose**, but invariants must match. The real server does strict Zod validation; demo can be lighter, but enforce the same business rules (e.g. cannot demote self, cannot reorder a task into a different project, etc.).

## The undefined-clone pitfall

`JSON.parse(JSON.stringify(undefined))` throws. Every mutation handler that returns 204-equivalent returns `undefined`. The `clone()` helper short-circuits this; do not bypass it.

## How to verify a change

```bash
# 1. Builds clean — types align
npm --workspace asana-web run build

# 2. Demo flow works in isolation (no backend, no Supabase)
npm run dev:demo
# open localhost:5173, exercise the new flow end-to-end

# 3. Live flow still works against real Supabase
npm run dev
# sign in, exercise the same flow
```

If step 2 doesn't work but step 3 does, the demo handler is wrong. Don't ship.

## What you don't do here

- Don't add demo-only features. The store mirrors the real API, full stop.
- Don't persist to localStorage. Demo state resets on reload — that's a feature, not a bug.
- Don't import from `web/src/components/*`. This module is data-only.
