# ADR 0003 — Per-status `position` integer for drag-and-drop priority

Date: 2026-04-26 · Status: accepted

## Context

Users want to reorder tasks within a status column to set priority. The All Tasks page should respect that order when grouping by project.

## Decision

Each task carries `tasks.position` (int). Within a status column, order is `ORDER BY position ASC, created_at ASC`. Reordering reassigns `0..N-1` for the affected column via a single `PUT /projects/:id/tasks/order` endpoint.

Frontend uses `@dnd-kit/sortable` with one `DndContext` per status column. Drop → optimistic local + cache update → single PUT. No N+1 PATCH calls.

## Alternatives considered

- **Fractional indexing** (lexicographic strings) — never need to renumber, but adds a string-math dependency and complicates the SQL ordering. Overkill for a personal app with ≤100 tasks per project.
- **Gap strategy (10, 20, 30…)** — most drops only update one row. Rejected for simplicity; the renumber-affected-column approach is one PUT regardless.
- **Cross-column drag** — would require multi-container DnD (more state, more edge cases). Status changes go through the dropdown on the card; drag is "up or down" only.

## Consequences

- `tasks.position` defaults to 0 on insert. Until a column is dragged, all positions are 0 and `created_at` is the tiebreaker. First drag-and-drop assigns positions deterministically.
- The reorder endpoint is **constrained by `project_id` AND `status`** in WHERE clauses — defense against accidental cross-project / cross-status mutations.
- All Tasks page sorts client-side by `(status, position, created_at)` (see [AllTasksPage.tsx](../../web/src/pages/AllTasksPage.tsx)), matching the project page's order.
- No activity event for reorders (intentionally — too noisy). Status changes via the dropdown still log `status_changed`.
