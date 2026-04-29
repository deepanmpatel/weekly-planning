// Pure helpers for the project-page drag-and-drop kanban.
// No React, no dnd-kit imports — easy to unit-test in isolation.

import type { Project, Status, Task } from "./types";
import { STATUS_ORDER } from "./types";

export type Grouped = Record<Status, Task[]>;

export function emptyGrouped(): Grouped {
  return { todo: [], in_progress: [], waiting_for_reply: [], done: [] };
}

export function groupByStatus(tasks: Task[]): Grouped {
  const out = emptyGrouped();
  for (const t of tasks) out[t.status].push(t);
  return out;
}

export function isStatusId(id: unknown): id is Status {
  return (
    id === "todo" ||
    id === "in_progress" ||
    id === "waiting_for_reply" ||
    id === "done"
  );
}

export function findContainer(grouped: Grouped, id: string): Status | null {
  if (isStatusId(id)) return id;
  for (const s of STATUS_ORDER) {
    if (grouped[s].some((t) => t.id === id)) return s;
  }
  return null;
}

function arrayMove<T>(list: readonly T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Computes the new grouped state after a drag-and-drop drop event.
 * Returns null when no change is needed (drop on self or invalid ids).
 *
 *   activeId: the dragged task's id
 *   overId:   either a task id OR a status string (when dropped on an empty
 *             column, dnd-kit reports the column's droppable id)
 */
export function applyDrop(
  grouped: Grouped,
  activeId: string,
  overId: string
): Grouped | null {
  const fromContainer = findContainer(grouped, activeId);
  const toContainer = findContainer(grouped, overId);
  if (!fromContainer || !toContainer) return null;

  if (fromContainer === toContainer) {
    const list = grouped[fromContainer];
    const oldIdx = list.findIndex((t) => t.id === activeId);
    if (oldIdx === -1) return null;

    let newIdx: number;
    if (isStatusId(overId)) {
      newIdx = list.length - 1;
    } else {
      newIdx = list.findIndex((t) => t.id === overId);
    }
    if (newIdx === -1 || oldIdx === newIdx) return null;

    return { ...grouped, [fromContainer]: arrayMove(list, oldIdx, newIdx) };
  }

  // Cross-container move: remove from source, insert into destination,
  // and update the moving task's status.
  const fromItems = grouped[fromContainer];
  const toItems = grouped[toContainer];
  const movingIdx = fromItems.findIndex((t) => t.id === activeId);
  if (movingIdx === -1) return null;

  const moving: Task = { ...fromItems[movingIdx], status: toContainer };

  let insertIdx: number;
  if (isStatusId(overId)) {
    insertIdx = toItems.length;
  } else {
    const idx = toItems.findIndex((t) => t.id === overId);
    insertIdx = idx === -1 ? toItems.length : idx;
  }

  return {
    ...grouped,
    [fromContainer]: fromItems.filter((t) => t.id !== activeId),
    [toContainer]: [
      ...toItems.slice(0, insertIdx),
      moving,
      ...toItems.slice(insertIdx),
    ],
  };
}

/**
 * Returns the task id arrays per status column — the body shape expected by
 * `PUT /projects/:id/tasks/reorder`.
 */
export function toReorderColumns(grouped: Grouped) {
  return {
    todo: grouped.todo.map((t) => t.id),
    in_progress: grouped.in_progress.map((t) => t.id),
    waiting_for_reply: grouped.waiting_for_reply.map((t) => t.id),
    done: grouped.done.map((t) => t.id),
  };
}

/**
 * Optimistically rewrites the cached project-tasks list to reflect a new
 * grouped state. Tasks not in any column (e.g. subtasks) are preserved.
 */
export function applyGroupedToCache(
  cached: Task[] | undefined,
  grouped: Grouped
): Task[] | undefined {
  if (!cached) return cached;
  const next: Task[] = [];
  const seen = new Set<string>();
  for (const s of STATUS_ORDER) {
    grouped[s].forEach((t, i) => {
      const existing = cached.find((o) => o.id === t.id);
      if (existing) {
        next.push({ ...existing, status: s, position: i });
        seen.add(t.id);
      }
    });
  }
  for (const o of cached) {
    if (!seen.has(o.id)) next.push(o);
  }
  return next;
}

interface ReorderColumns {
  todo: string[];
  in_progress: string[];
  waiting_for_reply: string[];
  done: string[];
}

/**
 * Optimistic cache update for `PUT /projects/:id/tasks/reorder`.
 * Re-keys `applyGroupedToCache` off ID arrays so the mutation hook can
 * compute the new state without needing the live `Grouped` shape.
 */
export function applyReorderColumnsToCache(
  cached: Task[] | undefined,
  columns: ReorderColumns
): Task[] | undefined {
  if (!cached) return cached;
  const update = new Map<string, { status: Status; position: number }>();
  for (const s of STATUS_ORDER) {
    columns[s].forEach((id, i) => update.set(id, { status: s, position: i }));
  }
  return cached.map((t) => {
    const u = update.get(t.id);
    return u ? { ...t, status: u.status, position: u.position } : t;
  });
}

/**
 * Optimistic cache update for `PUT /tasks/today/reorder` (single cell).
 * Sets `today_position` for tasks matching `(project_id, status)` whose id
 * appears in `ids`. Tasks outside that cell are untouched.
 */
export function applyTodayCellReorderToCache(
  cached: Task[] | undefined,
  projectId: string,
  status: Status,
  ids: string[]
): Task[] | undefined {
  if (!cached) return cached;
  const pos = new Map<string, number>();
  ids.forEach((id, i) => pos.set(id, i));
  return cached.map((t) => {
    if (t.project_id === projectId && t.status === status && pos.has(t.id)) {
      return { ...t, today_position: pos.get(t.id)! };
    }
    return t;
  });
}

/**
 * Optimistic cache update for a cross-cell move on TodayPage: the moving
 * task gets the new status + today_position; other tasks in the destination
 * cell get their today_position recomputed. Source-cell tasks keep their
 * existing today_position (the next refetch reconciles any tightening).
 */
export function applyTodayCrossCellMoveToCache(
  cached: Task[] | undefined,
  taskId: string,
  destProjectId: string,
  destStatus: Status,
  destIds: string[]
): Task[] | undefined {
  if (!cached) return cached;
  const pos = new Map<string, number>();
  destIds.forEach((id, i) => pos.set(id, i));
  return cached.map((t) => {
    if (t.id === taskId) {
      return {
        ...t,
        project_id: destProjectId,
        status: destStatus,
        today_position: pos.get(taskId) ?? 0,
      };
    }
    if (
      t.project_id === destProjectId &&
      t.status === destStatus &&
      pos.has(t.id)
    ) {
      return { ...t, today_position: pos.get(t.id)! };
    }
    return t;
  });
}

/**
 * Optimistic cache update for `PUT /projects/order`. Reorders `cached` to
 * match `orderedIds`, with any unlisted projects appended in their original
 * order. Each project's `position` is set to its new index.
 */
export function applyProjectsReorderToCache(
  cached: Project[] | undefined,
  orderedIds: string[]
): Project[] | undefined {
  if (!cached) return cached;
  const byId = new Map(cached.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const out: Project[] = [];
  for (const id of orderedIds) {
    const p = byId.get(id);
    if (p) {
      out.push(p);
      seen.add(id);
    }
  }
  for (const p of cached) {
    if (!seen.has(p.id)) out.push(p);
  }
  return out.map((p, i) => ({ ...p, position: i }));
}
