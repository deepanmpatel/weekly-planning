# ADR 0005 — Decouple Today ordering from project ordering with `today_position`

Date: 2026-04-28 · Status: accepted

## Context

The Today page is a swim-lane kanban: rows are projects, columns are the four statuses, cells contain only tasks with `is_today=true`. Users drag tasks within a cell to set their order on the Today board. They also drag the same tasks on the Project page, where the existing `tasks.position` drives priority.

These two orderings are independent: a user might want a task ranked low on its project page but at the top of Today (because it's what they're tackling first this morning). If we reused `position`, every Today reorder would silently reshuffle the project board, and vice versa.

## Decision

Add a second integer column, `tasks.today_position`, that orders tasks within `(project_id, status)` only when `is_today=true`. The Today board sorts by `(project.position, today_position, created_at)`. The project board continues to sort by `(status, position, created_at)`.

When `is_today` flips false → true via `PATCH /tasks/:id`, the server sets `today_position` to one greater than the current max for the destination `(project_id, status)` cell — i.e. drops the task at the bottom. Reordering is a single `PUT /tasks/today/reorder` that reassigns 0..N-1 within a cell, mirroring the shape of `PUT /projects/:id/tasks/order`.

A partial index `tasks_is_today_idx ON tasks(is_today) WHERE is_today` makes the Today list scan cheap; the column is small and only flagged rows are indexed.

## Alternatives considered

- **Reuse `tasks.position`**. Rejected: as above, drags on one board would corrupt the other's order. Users would never trust either.
- **Single global `today_position` (not per-cell)**. Rejected: cross-cell renumber would touch every flagged row on every drag, and would tangle status changes (which already shift cells) with priority.
- **Compute order from a separate join table** (`today_entries(task_id, position)`). Rejected: extra table, extra joins on the hottest read path, no benefit over a column on a row that already has to load.

## Consequences

- `today_position` defaults to 0; `created_at` is the tiebreaker until a user drags. Same shape as `position`.
- The Today reorder endpoint guards on `project_id`, `status`, AND `is_today=true` in WHERE clauses — defense against accidental mutation of unflagged rows.
- Toggling `is_today` does not perturb `position`. Toggling `is_today` off does not zero `today_position` — it just stops being read. (If the user re-flags later they end up at the bottom anyway, because the false→true branch resets to bottom-of-cell.)
- Lazy cleanup at `GET /tasks/today` flips `is_today=false` for `done` tasks completed before today's America/Los_Angeles midnight. Mirrored in [demoStore.ts](../../web/src/lib/demo/demoStore.ts). The cutoff helper (`todayPtMidnightUtcIso()`) is the first TZ-anchored cutoff in the codebase — reuse the same `Intl.DateTimeFormat`-based pattern if more land.
- New event kinds `today_flagged` / `today_unflagged` log every toggle (whether via the star button on a card, the drawer, or a cross-cell drag that flips the flag).
