import { useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
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
  groupByStatus,
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
      className={`flex min-h-0 flex-col rounded-xl ${COLUMN_BG[status]} p-3`}
    >
      <header className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-700">
          {STATUS_LABEL[status]}
        </h2>
        <span className="text-[11px] tabular-nums text-ink-500">
          {tasks.length}
        </span>
      </header>
      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2 overflow-y-auto overflow-x-hidden rounded-lg px-1 transition-colors ${
          isOver ? "bg-white/50 ring-2 ring-blue-300/60" : ""
        }`}
      >
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
  const { data: tasks = [], isLoading } = useProjectTasks(id);
  const { data: projects = [] } = useProjects();
  const reorder = useReorderProjectTasks();
  const qc = useQueryClient();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  // Mirror server state locally so we can render the dropped position
  // immediately without waiting for the refetch.
  const [grouped, setGrouped] = useState<Grouped>(emptyGrouped);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setGrouped(groupByStatus(tasks));
  }, [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const project = projects.find((p) => p.id === id);
  const tasksById = useMemo(() => {
    const map = new Map<string, Task>();
    for (const t of tasks) map.set(t.id, t);
    return map;
  }, [tasks]);
  const activeTask = activeId ? tasksById.get(activeId) ?? null : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || !id) return;

    const next = applyDrop(grouped, String(active.id), String(over.id));
    if (!next) return;

    setGrouped(next);
    qc.setQueryData<Task[]>(["projects", id, "tasks"], (old) =>
      applyGroupedToCache(old, next)
    );
    reorder.mutate({ projectId: id, columns: toReorderColumns(next) });
  }

  function handleDragCancel() {
    setActiveId(null);
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
          {tasks.length} tasks · {grouped.done.length} done
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
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-6 md:grid-cols-3">
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
