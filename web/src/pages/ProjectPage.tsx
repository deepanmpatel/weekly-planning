import { useParams } from "react-router-dom";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  useProjectTasks,
  useProjects,
  useReorderProjectTasks,
} from "../lib/api";
import type { Status, Task } from "../lib/types";
import { STATUS_LABEL, STATUS_ORDER } from "../lib/types";
import {
  applyDrop,
  applyGroupedToCache,
  emptyGrouped,
  findContainer,
  groupByStatus,
  isStatusId,
  toReorderColumns,
  type Grouped,
} from "../lib/dragLogic";
import { TaskCard } from "../components/TaskCard";
import { SortableTaskCard } from "../components/SortableTaskCard";
import { NewTaskInline } from "../components/NewTaskInline";
import { TaskDrawer } from "../components/TaskDrawer";

const COLUMN_BG: Record<Status, string> = {
  todo: "bg-ink-100/60",
  in_progress: "bg-amber-50",
  waiting_for_reply: "bg-sky-50",
  done: "bg-emerald-50",
};

function Column({
  status,
  tasks,
  setOpenTaskId,
}: {
  status: Status;
  tasks: Task[];
  setOpenTaskId: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      className={`flex min-h-0 flex-col rounded-xl ${COLUMN_BG[status]} p-3 transition-shadow ${
        isOver ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-white" : ""
      }`}
    >
      <header className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-700">
          {STATUS_LABEL[status]}
        </h2>
        <span className="text-[11px] tabular-nums text-ink-500">
          {tasks.length}
        </span>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto overflow-x-hidden rounded-lg px-1">
        <SortableContext
          id={status}
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((t) => (
            <SortableTaskCard
              key={t.id}
              task={t}
              onOpen={() => setOpenTaskId(t.id)}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="rounded-md border border-dashed border-ink-200 px-3 py-6 text-center text-xs text-ink-500">
            Empty — drop here
          </div>
        )}
      </div>
    </section>
  );
}

export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useProjectTasks(id);
  const { data: projects = [] } = useProjects();
  const reorder = useReorderProjectTasks();
  const qc = useQueryClient();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Snapshot the pre-drag cache so dragCancel can restore it (dragOver may
  // have already mutated it).
  const dragStartCacheRef = useRef<Task[] | undefined>(undefined);

  // Derived (NOT state). When `data` is stable, this is memoized stable too.
  // When the cache updates (after a drop), `data` flips to the new reference
  // and `grouped` recomputes. No useEffect, no setGrouped, no loop.
  const grouped = useMemo(
    () => (data ? groupByStatus(data) : emptyGrouped()),
    [data]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const project = projects.find((p) => p.id === id);

  const tasksById = useMemo(() => {
    const map = new Map<string, Task>();
    for (const t of data ?? []) map.set(t.id, t);
    return map;
  }, [data]);
  const activeTask = activeId ? tasksById.get(activeId) ?? null : null;
  const taskCount = data?.length ?? 0;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    if (id) {
      dragStartCacheRef.current = qc.getQueryData<Task[]>([
        "projects",
        id,
        "tasks",
      ]);
    }
  }

  // Cross-column drag preview: as soon as the cursor enters a different
  // column, move the active task into that column in the cache. The
  // destination's verticalListSortingStrategy then opens a gap at the
  // hover position, and the drop animation lands at the right place
  // (no snap-back). Same-column hovers are handled by useSortable itself.
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || !id) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    if (activeIdStr === overIdStr) return;

    const cached = qc.getQueryData<Task[]>(["projects", id, "tasks"]);
    if (!cached) return;
    const currentGrouped = groupByStatus(cached);

    const activeContainer = findContainer(currentGrouped, activeIdStr);
    const overContainer = isStatusId(overIdStr)
      ? overIdStr
      : findContainer(currentGrouped, overIdStr);
    if (!activeContainer || !overContainer) return;
    if (activeContainer === overContainer) return;

    const activeItems = currentGrouped[activeContainer];
    const overItems = currentGrouped[overContainer];
    const activeItem = activeItems.find((t) => t.id === activeIdStr);
    if (!activeItem) return;

    // Stable insert index: when `over` is a task, decide before/after based
    // on the cursor relative to that task's vertical center. Without this,
    // dnd-kit's collision detection alternates `over` between the column
    // and its last task as the cursor sits in the empty space below the
    // list — which would make the last item's transform flip on/off and
    // appear to "jump."
    let insertIdx: number;
    if (isStatusId(overIdStr)) {
      insertIdx = overItems.length;
    } else {
      const overIdx = overItems.findIndex((t) => t.id === overIdStr);
      if (overIdx === -1) {
        insertIdx = overItems.length;
      } else {
        const activeTop = active.rect.current.translated?.top;
        const overMid = over.rect.top + over.rect.height / 2;
        const insertAfter =
          activeTop !== undefined && activeTop > overMid;
        insertIdx = overIdx + (insertAfter ? 1 : 0);
      }
    }

    const movedTask: Task = { ...activeItem, status: overContainer };
    const next: Grouped = {
      ...currentGrouped,
      [activeContainer]: activeItems.filter((t) => t.id !== activeIdStr),
      [overContainer]: [
        ...overItems.slice(0, insertIdx),
        movedTask,
        ...overItems.slice(insertIdx),
      ],
    };

    qc.setQueryData<Task[]>(
      ["projects", id, "tasks"],
      applyGroupedToCache(cached, next)
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || !id) {
      handleDragCancel();
      return;
    }

    // Read the latest cache (may already reflect cross-column moves from
    // handleDragOver) and apply any final position change.
    const cached = qc.getQueryData<Task[]>(["projects", id, "tasks"]);
    const startSnapshot = dragStartCacheRef.current;
    dragStartCacheRef.current = undefined;
    if (!cached) return;
    const currentGrouped = groupByStatus(cached);

    const sameContainerMove = applyDrop(
      currentGrouped,
      String(active.id),
      String(over.id)
    );
    const final = sameContainerMove ?? currentGrouped;

    if (sameContainerMove) {
      qc.setQueryData<Task[]>(
        ["projects", id, "tasks"],
        applyGroupedToCache(cached, sameContainerMove)
      );
    }

    // Skip the network call when nothing changed end-to-end (drag-over
    // never moved containers and drop didn't trigger a same-container
    // reorder).
    if (!sameContainerMove && startSnapshot === cached) {
      return;
    }

    reorder.mutate({ projectId: id, columns: toReorderColumns(final) });
  }

  function handleDragCancel() {
    setActiveId(null);
    if (id && dragStartCacheRef.current) {
      qc.setQueryData<Task[]>(
        ["projects", id, "tasks"],
        dragStartCacheRef.current
      );
    }
    dragStartCacheRef.current = undefined;
  }

  if (!id) return null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-ink-200 bg-white px-6 py-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            Project
          </div>
          <h1 className="text-xl font-semibold text-ink-900">
            {project?.name ?? "…"}
          </h1>
        </div>
        <div className="text-xs text-ink-500 tabular-nums">
          {taskCount} tasks · {grouped.done.length} done
        </div>
      </header>

      <div className="border-b border-ink-200 bg-white px-6 py-3">
        <NewTaskInline
          projectId={id}
          placeholder="Add a task to this project…"
        />
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-ink-500">
          Loading tasks…
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
          <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-6 md:grid-cols-2 xl:grid-cols-4">
            {STATUS_ORDER.map((s) => (
              <Column
                key={s}
                status={s}
                tasks={grouped[s]}
                setOpenTaskId={setOpenTaskId}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask ? <TaskCard task={activeTask} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <TaskDrawer
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
        onOpenChild={(t) => setOpenTaskId(t.id)}
      />
    </div>
  );
}
