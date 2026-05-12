# ADR 0007 — Prioritized page splits by tag-derived Work / Non-work buckets

Date: 2026-05-11 · Status: accepted

## Context

The original Prioritized page (formerly Today) rendered a per-project swim-lane kanban — one row per project, four status columns. As the project list grew, the vertical sprawl made it hard to answer the only question that page exists to answer: *what should I work on next?* Worse, "by project" was a poor proxy for the actual mental split users use to triage: **work** vs **everything else** (personal / household / side projects).

We wanted a top-level split that:

1. Is the user's own classification, not an admin/project taxonomy.
2. Persists across sessions without per-task UI ceremony.
3. Stays consistent everywhere — a task labeled "work" should look the same on every board, drawer, and activity log.
4. Doesn't require yet another schema column for the classifier itself.
5. Doesn't entangle with the existing project-board (`position`) or Today-board (`today_position`) orderings.

## Decision

**Bucket by tag, derive server-side, store ordering in a new column.**

- A task is in the **Work** bucket iff it carries a tag whose `lower(name) = 'work'`. Otherwise it's in **Non-work**. The bucket is never stored on `tasks` — it's computed on every read.
- Migration `0009_add_tasks_prioritized_position.sql` seeds the canonical `work` tag (color `#2563eb`) idempotently. Users can't end up with two different "work" tags because `tags.name` is unique.
- A new column `tasks.prioritized_position int not null default 0` orders tasks within `(bucket, status)`. It is independent of `position` and `today_position` for the same reason those two are independent of each other (see [ADR 0005](0005-today-flag-decoupled-position.md)).
- New endpoints in [server/src/routes/tasks.ts](../../server/src/routes/tasks.ts):
  - `GET /tasks/prioritized` returns top-level tasks (no subtasks) enriched with `bucket`, `project_name`, `tags`, `assignee`, applies the same stale-done cutoff as `/tasks/today`, sorts by `(bucket asc, status order, prioritized_position asc, created_at asc)` with Done within a bucket falling back to `completed_at desc`.
  - `PUT /tasks/prioritized/reorder {bucket, status, ids}` re-derives each id's server-truth bucket and status and 400s on any mismatch with **no partial writes** (validation precedes any update). The client claim is never trusted.
- Frontend ([web/src/pages/PrioritizedPage.tsx](../../web/src/pages/PrioritizedPage.tsx)) renders two stacked bucket cards with one `DndContext` per bucket, so drag is locked within a bucket. Cross-bucket movement requires editing tags, which is the intended UX. The cross-cell cache helper `applyPrioritizedCrossCellMoveToCache` defensively no-ops on cross-bucket calls.
- Quick-add ([web/src/components/NewTaskInline.tsx](../../web/src/components/NewTaskInline.tsx)) gained a link-styled "Work" toggle via a `QuickTagToggle` component + `QUICK_TAGS` config array, so additional quick-tag buttons can be added without component duplication.

## Alternatives considered

- **Add a `tasks.is_work` boolean column.** Rejected: yet another piece of taxonomy stored on every row, with no read-everywhere benefit. Tags are already the user's classifier surface; adding a sibling concept makes "is this task work?" answerable in two contradictory ways. Tags also display consistently on every card without UI changes.
- **Project-level `is_work` flag** ("all tasks in these projects are work"). Rejected: too coarse. Users routinely have a single project that mixes work and non-work items (e.g. a "Maintenance" project covering both work systems and home automation).
- **Trust the client's `bucket` claim in the reorder endpoint.** Rejected: a stale client could send `bucket: "work"` for a task whose `work` tag was just removed in another tab, and we'd write `prioritized_position` to the wrong cell silently. Server re-derivation + 400-on-mismatch with no partial writes is the only safe shape.
- **Reuse `tasks.today_position` for prioritized ordering.** Rejected: same trap as ADR 0005 — dragging on one board would scramble the other. The columns are cheap (int, default 0) and the cost of an extra one is negligible vs. the cost of cross-board interference.
- **Per-project bucketing UI inside the Prioritized page itself.** Rejected: it's what we just removed. The whole point was to flatten away the project axis on this page.

## Consequences

- **Bucket is read-derived everywhere.** Anything that needs to know a task's bucket must compute it from tags. `Task.bucket` exists only as a transient field returned by `GET /tasks/prioritized` — never persisted, never sent on writes. Other routes that return `Task` don't populate it.
- **Renaming or recoloring the canonical `work` tag is allowed** but the bucket logic only matches by `lower(name) = 'work'`. If a user truly wants to rename the bucket label, that's a future feature; today, "work" is the magic string. The seeded tag's color is overridable from the Admin UI.
- **`POST /tasks` seeds `prioritized_position = max+1` globally**, mirroring the pattern for `position`. New tasks land at the bottom of their bucket-and-status cell. The 0-default from migration means existing rows tie on insertion order until the first drag.
- **Mutations that change tags invalidate `qk.prioritized`** in addition to their existing keys (`useAttachTag`, `useDetachTag`, `useCreateTask`, `useUpdateTask`). Without this the page wouldn't react to bucket changes from other surfaces.
- **Demo parity is mandatory** — `demoStore.ts` mirrors `/tasks/prioritized` and `/tasks/prioritized/reorder` (same sort, same 400-on-mismatch behavior), and `demoData.ts` attaches the `work` tag to ~3 seed tasks so the page is non-empty on first load.
- **Drag is bucket-locked.** To move a task across buckets the user must add/remove the `work` tag (via the quick-add toggle, the task drawer, or a tag chip elsewhere). This is intentional — it keeps "what's a work task?" as an explicit user decision, not an accidental consequence of a drag gesture.
- **The legacy `/prioritized` URL redirects to `/`** (see [web/src/App.tsx](../../web/src/App.tsx)) so old bookmarks survive the route consolidation.

## When to revisit

- If a third bucket emerges (e.g. "Side projects"), generalize: keep the tag-derived pattern but make the bucket set configurable rather than hardcoding `work` / `non_work`. Likely a `bucket_tags` config array or a `tags.is_bucket boolean` column.
- If `prioritized_position` collisions become a real problem at scale (lots of users, lots of tasks), reuse the renumber-on-reorder pattern already used by the column reorder endpoints — the storage shape doesn't change.
