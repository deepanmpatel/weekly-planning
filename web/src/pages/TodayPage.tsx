import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  useProjects,
  useReorderProjects,
  useReorderTodayCell,
  useTodayTasks,
  useUpdateTask,
} from "../lib/api";
import type { Project, Status, Task } from "../lib/types";
import { STATUS_LABEL, STATUS_ORDER } from "../lib/types";
import {
  applyProjectsReorderToCache,
  applyTodayCellReorderToCache,
  applyTodayCrossCellMoveToCache,
  sortDoneByCompletedAt,
} from "../lib/dragLogic";

function sortCellForDisplay(tasks: Task[], status: Status): Task[] {
  if (status === "done") return sortDoneByCompletedAt(tasks);
  return [...tasks].sort((a, b) => a.today_position - b.today_position);
}
import { TaskCard } from "../components/TaskCard";
import { SortableTaskCard } from "../components/SortableTaskCard";
import { TaskDrawer } from "../components/TaskDrawer";

const COLUMN_BG: Record<Status, string> = {
  todo: "bg-ink-100/60",
  in_progress: "bg-amber-50",
  waiting_for_reply: "bg-sky-50",
  done: "bg-emerald-50",
};

type CellMap = Record<Status, Task[]>;

function emptyCells(): CellMap {
  return { todo: [], in_progress: [], waiting_for_reply: [], done: [] };
}

function projectColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 55% 48%)`;
}

function cellId(projectId: string, status: Status): string {
  return `cell:${projectId}:${status}`;
}

function parseCellId(id: string): { project_id: string; status: Status } | null {
  if (!id.startsWith("cell:")) return null;
  const [, project_id, status] = id.split(":");
  if (!project_id || !STATUS_ORDER.includes(status as Status)) return null;
  return { project_id, status: status as Status };
}

function Cell({
  project,
  status,
  tasks,
  onOpen,
}: {
  project: Project;
  status: Status;
  tasks: Task[];
  onOpen: (t: Task) => void;
}) {
  const id = cellId(project.id, status);
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { kind: "cell", project_id: project.id, status },
  });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[72px] flex-col rounded-lg ${COLUMN_BG[status]} p-2 transition-colors ${
        isOver ? "ring-2 ring-blue-300/60" : ""
      }`}
    >
      <SortableContext
        id={id}
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {tasks.map((t) => (
            <SortableTaskCard
              key={t.id}
              task={t}
              onOpen={onOpen}
            />
          ))}
        </div>
      </SortableContext>
      {tasks.length === 0 && (
        <div className="rounded-md border border-dashed border-ink-200 px-3 py-4 text-center text-xs text-ink-500">
          Empty — drop here
        </div>
      )}
    </div>
  );
}

function ProjectRow({
  project,
  cells,
  onOpen,
}: {
  project: Project;
  cells: CellMap;
  onOpen: (t: Task) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id, data: { kind: "project" } });

  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(0px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const total = STATUS_ORDER.reduce((acc, s) => acc + cells[s].length, 0);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-xl border border-ink-200 bg-white p-3 shadow-card"
    >
      <div className="mb-2 flex items-center gap-2 px-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${project.name}`}
          title="Drag to reorder project"
          className="flex h-6 w-3 shrink-0 cursor-grab items-center justify-center rounded text-ink-300 hover:text-ink-700 active:cursor-grabbing"
        >
          <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor">
            <circle cx="2" cy="3" r="1" />
            <circle cx="2" cy="7" r="1" />
            <circle cx="2" cy="11" r="1" />
            <circle cx="6" cy="3" r="1" />
            <circle cx="6" cy="7" r="1" />
            <circle cx="6" cy="11" r="1" />
          </svg>
        </button>
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: projectColor(project.id) }}
        />
        <h2 className="text-sm font-semibold text-ink-900">{project.name}</h2>
        <span className="text-[11px] tabular-nums text-ink-500">{total}</span>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        {STATUS_ORDER.map((s) => (
          <div key={s} className="flex flex-col">
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
                {STATUS_LABEL[s]}
              </span>
              <span className="text-[10px] tabular-nums text-ink-500">
                {cells[s].length}
              </span>
            </div>
            <Cell
              project={project}
              status={s}
              tasks={cells[s]}
              onOpen={onOpen}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TodayPage() {
  const { data: tasks = [], isLoading, error } = useTodayTasks();
  const { data: projects = [] } = useProjects();
  const reorderProjects = useReorderProjects();
  const reorderTodayCell = useReorderTodayCell();
  const updateTask = useUpdateTask();
  const qc = useQueryClient();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeKind, setActiveKind] = useState<"project" | "task" | null>(null);
  // Captured on dragStart so cancellation/error can restore the pre-drag cache,
  // and so dragEnd can detect cross-cell status changes.
  const dragStartRef = useRef<{
    cache: Task[] | undefined;
    activeStatus: Status;
    activeProjectId: string;
  } | null>(null);

  const grouped = useMemo(() => {
    const out: Record<string, CellMap> = {};
    for (const t of tasks) {
      if (!out[t.project_id]) out[t.project_id] = emptyCells();
      out[t.project_id][t.status].push(t);
    }
    for (const projectId in out) {
      for (const s of STATUS_ORDER) {
        if (s === "done") {
          out[projectId][s].sort((a, b) => {
            const ad = a.completed_at;
            const bd = b.completed_at;
            if (ad && bd) return bd.localeCompare(ad);
            if (ad) return -1;
            if (bd) return 1;
            return 0;
          });
        } else {
          out[projectId][s].sort((a, b) => {
            if (a.today_position !== b.today_position)
              return a.today_position - b.today_position;
            return a.created_at.localeCompare(b.created_at);
          });
        }
      }
    }
    return out;
  }, [tasks]);

  const projectsWithTasks = useMemo(
    () =>
      projects.filter((p) => {
        const cells = grouped[p.id];
        if (!cells) return false;
        return STATUS_ORDER.some((s) => cells[s].length > 0);
      }),
    [projects, grouped]
  );

  const projectIds = useMemo(
    () => projectsWithTasks.map((p) => p.id),
    [projectsWithTasks]
  );

  const tasksById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of tasks) m.set(t.id, t);
    return m;
  }, [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const activeTask =
    activeKind === "task" && activeId ? tasksById.get(activeId) ?? null : null;

  function resolveDestCell(
    cached: Task[],
    over: { id: string | number; data: { current?: unknown } }
  ): { project_id: string; status: Status } | null {
    const overIdStr = String(over.id);
    const overData = over.data.current as
      | { kind?: string; project_id?: string; status?: Status }
      | undefined;
    if (overData?.kind === "cell" && overData.project_id && overData.status) {
      return { project_id: overData.project_id, status: overData.status };
    }
    const overTask = cached.find((t) => t.id === overIdStr);
    if (overTask) {
      return { project_id: overTask.project_id, status: overTask.status };
    }
    const parsed = parseCellId(overIdStr);
    return parsed;
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveId(id);
    const kind = event.active.data.current?.kind;
    setActiveKind(kind === "project" ? "project" : "task");
    if (kind !== "project") {
      const t = tasksById.get(id);
      const cache = qc.getQueryData<Task[]>(["tasks", "today"]);
      dragStartRef.current = t
        ? {
            cache,
            activeStatus: t.status,
            activeProjectId: t.project_id,
          }
        : null;
    } else {
      dragStartRef.current = null;
    }
  }

  // Cross-cell drag preview within the same project: when the cursor enters
  // a different status cell, move the active task into that cell in the
  // cache. The destination's verticalListSortingStrategy then opens a gap
  // at the hover position. Same-cell moves are handled by useSortable.
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    if (active.data.current?.kind === "project") return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    if (activeIdStr === overIdStr) return;

    const cached = qc.getQueryData<Task[]>(["tasks", "today"]);
    if (!cached) return;
    const activeTask = cached.find((t) => t.id === activeIdStr);
    if (!activeTask) return;

    const dest = resolveDestCell(cached, over);
    if (!dest) return;
    if (dest.project_id !== activeTask.project_id) return; // cross-project blocked
    if (dest.status === activeTask.status) return; // same cell, useSortable handles

    const destCellTasks = sortCellForDisplay(
      cached.filter(
        (t) =>
          t.project_id === dest.project_id &&
          t.status === dest.status &&
          t.id !== activeIdStr
      ),
      dest.status
    );

    const overData = over.data.current as { kind?: string } | undefined;
    // Stable insert index: when `over` is a task, decide before/after based
    // on the cursor relative to that task's vertical center. Without this,
    // dnd-kit's collision detection alternates `over` between the cell and
    // its last task as the cursor sits in the empty space below the list,
    // which would make the last item's transform flip on/off and appear
    // to "jump."
    let insertIdx: number;
    if (overData?.kind === "cell") {
      insertIdx = destCellTasks.length;
    } else {
      const overIdx = destCellTasks.findIndex((t) => t.id === overIdStr);
      if (overIdx === -1) {
        insertIdx = destCellTasks.length;
      } else {
        const activeTop = active.rect.current.translated?.top;
        const overMid = over.rect.top + over.rect.height / 2;
        const insertAfter =
          activeTop !== undefined && activeTop > overMid;
        insertIdx = overIdx + (insertAfter ? 1 : 0);
      }
    }

    const newDestIds = [
      ...destCellTasks.slice(0, insertIdx).map((t) => t.id),
      activeIdStr,
      ...destCellTasks.slice(insertIdx).map((t) => t.id),
    ];

    qc.setQueryData<Task[]>(["tasks", "today"], (old) =>
      applyTodayCrossCellMoveToCache(
        old,
        activeIdStr,
        dest.project_id,
        dest.status,
        newDestIds
      )
    );
  }

  function handleDragCancel() {
    setActiveId(null);
    setActiveKind(null);
    // Restore pre-drag cache if dragOver mutated it.
    if (dragStartRef.current?.cache) {
      qc.setQueryData<Task[]>(["tasks", "today"], dragStartRef.current.cache);
    }
    dragStartRef.current = null;
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setActiveKind(null);
    if (!over) {
      handleDragCancel();
      return;
    }

    const activeData = active.data.current as { kind?: string } | undefined;

    if (activeData?.kind === "project") {
      dragStartRef.current = null;
      if (active.id === over.id) return;
      const oldIdx = projectsWithTasks.findIndex((p) => p.id === active.id);
      const newIdx = projectsWithTasks.findIndex((p) => p.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return;
      const reordered = arrayMove(projectsWithTasks, oldIdx, newIdx);
      const reorderedIds = reordered.map((p) => p.id);
      const remaining = projects
        .filter((p) => !reorderedIds.includes(p.id))
        .map((p) => p.id);
      const orderedIds = [...reorderedIds, ...remaining];
      // Sync optimistic write before mutate so the drop animation lands
      // at the new position instead of snapping back.
      qc.setQueryData<Project[]>(["projects"], (old) =>
        applyProjectsReorderToCache(old, orderedIds)
      );
      reorderProjects.mutate(orderedIds);
      return;
    }

    const start = dragStartRef.current;
    dragStartRef.current = null;
    if (!start) return;

    const cached = qc.getQueryData<Task[]>(["tasks", "today"]);
    if (!cached) return;
    const activeIdStr = String(active.id);
    const activeTask = cached.find((t) => t.id === activeIdStr);
    if (!activeTask) return;

    // After possible dragOver moves, active is in its current cell. Compute
    // final ids for that cell, applying same-cell reorder if dropped on a
    // task within it.
    const cellTasks = sortCellForDisplay(
      cached.filter(
        (t) =>
          t.project_id === activeTask.project_id &&
          t.status === activeTask.status
      ),
      activeTask.status
    );

    const overIdStr = String(over.id);
    const overTask = cached.find((t) => t.id === overIdStr);
    let finalCellTasks = cellTasks;
    if (
      overTask &&
      overTask.id !== activeIdStr &&
      overTask.project_id === activeTask.project_id &&
      overTask.status === activeTask.status
    ) {
      const oldIdx = cellTasks.findIndex((t) => t.id === activeIdStr);
      const newIdx = cellTasks.findIndex((t) => t.id === overTask.id);
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        finalCellTasks = arrayMove(cellTasks, oldIdx, newIdx);
      }
    }
    const finalCellIds = finalCellTasks.map((t) => t.id);

    // Sync optimistic write (positions in the final cell).
    qc.setQueryData<Task[]>(["tasks", "today"], (old) =>
      applyTodayCellReorderToCache(
        old,
        activeTask.project_id,
        activeTask.status,
        finalCellIds
      )
    );

    const statusChanged = activeTask.status !== start.activeStatus;
    if (statusChanged) {
      // Sequence the mutations so the backend reorder sees the updated
      // status. Both fire in the background; UI is already up to date.
      updateTask.mutate(
        { id: activeIdStr, patch: { status: activeTask.status } },
        {
          onSuccess: () => {
            reorderTodayCell.mutate({
              project_id: activeTask.project_id,
              status: activeTask.status,
              ids: finalCellIds,
            });
          },
        }
      );
    } else {
      // Same-cell only: skip mutation if nothing changed.
      const startCellTasks = sortCellForDisplay(
        (start.cache ?? []).filter(
          (t) =>
            t.project_id === activeTask.project_id &&
            t.status === activeTask.status
        ),
        activeTask.status
      );
      const startIds = startCellTasks.map((t) => t.id);
      const orderUnchanged =
        startIds.length === finalCellIds.length &&
        startIds.every((id, i) => id === finalCellIds[i]);
      if (orderUnchanged) return;
      reorderTodayCell.mutate({
        project_id: activeTask.project_id,
        status: activeTask.status,
        ids: finalCellIds,
      });
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-ink-200 bg-white px-6 py-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            Overview
          </div>
          <h1 className="text-xl font-semibold text-ink-900">Prioritized</h1>
        </div>
        <div className="text-xs text-ink-500 tabular-nums">
          {tasks.length} tasks
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <div className="font-semibold">Couldn't load Prioritized</div>
            <div className="mt-1 font-mono text-xs">{error.message}</div>
          </div>
        )}
        {isLoading ? (
          <div className="text-sm text-ink-500">Loading…</div>
        ) : projectsWithTasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink-200 p-8 text-center text-sm text-ink-500">
            No tasks marked Prioritized. Tap the star on any task to add it.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={projectIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {projectsWithTasks.map((p) => (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    cells={grouped[p.id] ?? emptyCells()}
                    onOpen={(t) => setOpenTaskId(t.id)}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeTask ? <TaskCard task={activeTask} /> : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      <TaskDrawer
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
        onOpenChild={(t) => setOpenTaskId(t.id)}
      />
    </div>
  );
}
