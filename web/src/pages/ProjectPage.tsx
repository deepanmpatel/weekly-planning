import { useParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  useProjectTasks,
  useProjects,
  useReorderProjectTasks,
} from "../lib/api";
import type { Status, Task } from "../lib/types";
import { STATUS_LABEL, STATUS_ORDER } from "../lib/types";
import { TaskCard } from "../components/TaskCard";
import { SortableTaskCard } from "../components/SortableTaskCard";
import { NewTaskInline } from "../components/NewTaskInline";
import { TaskDrawer } from "../components/TaskDrawer";

const COLUMN_BG: Record<Status, string> = {
  todo: "bg-ink-100/60",
  in_progress: "bg-amber-50",
  done: "bg-emerald-50",
};

type Grouped = Record<Status, Task[]>;

function groupByStatus(tasks: Task[]): Grouped {
  const out: Grouped = { todo: [], in_progress: [], done: [] };
  for (const t of tasks) out[t.status].push(t);
  return out;
}

function isStatusId(id: unknown): id is Status {
  return id === "todo" || id === "in_progress" || id === "done";
}

function findContainer(grouped: Grouped, id: string): Status | null {
  if (isStatusId(id)) return id;
  for (const s of STATUS_ORDER) {
    if (grouped[s].some((t) => t.id === id)) return s;
  }
  return null;
}

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
          isOver ? "bg-white/40 ring-2 ring-blue-300/60" : ""
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

  // Local state mirrors server state during drag for instant feedback.
  const [grouped, setGrouped] = useState<Grouped>({
    todo: [],
    in_progress: [],
    done: [],
  });
  // Snapshot taken on dragStart so we can compute changes on dragEnd.
  const dragStartSnapshot = useRef<Grouped | null>(null);
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
    dragStartSnapshot.current = {
      todo: [...grouped.todo],
      in_progress: [...grouped.in_progress],
      done: [...grouped.done],
    };
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    setGrouped((prev) => {
      const activeContainer = findContainer(prev, activeIdStr);
      const overContainer = findContainer(prev, overIdStr);
      if (!activeContainer || !overContainer) return prev;
      if (activeContainer === overContainer) return prev;

      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];
      const activeIndex = activeItems.findIndex((t) => t.id === activeIdStr);
      if (activeIndex === -1) return prev;

      let overIndex: number;
      if (isStatusId(overIdStr)) {
        // Hovering over the column itself (e.g. empty column)
        overIndex = overItems.length;
      } else {
        const idx = overItems.findIndex((t) => t.id === overIdStr);
        overIndex = idx === -1 ? overItems.length : idx;
      }

      const moving = { ...activeItems[activeIndex], status: overContainer };
      return {
        ...prev,
        [activeContainer]: activeItems.filter(
          (t) => t.id !== activeIdStr
        ),
        [overContainer]: [
          ...overItems.slice(0, overIndex),
          moving,
          ...overItems.slice(overIndex),
        ],
      };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!id) return;
    if (!over) {
      // Cancelled mid-air: revert to snapshot
      if (dragStartSnapshot.current) setGrouped(dragStartSnapshot.current);
      dragStartSnapshot.current = null;
      return;
    }

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    setGrouped((prev) => {
      const container = findContainer(prev, activeIdStr);
      if (!container) return prev;
      // Within-column reorder (cross-column moves were handled in dragOver)
      const list = prev[container];
      const oldIdx = list.findIndex((t) => t.id === activeIdStr);
      const newIdx = isStatusId(overIdStr)
        ? list.length - 1
        : list.findIndex((t) => t.id === overIdStr);
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return prev;
      return { ...prev, [container]: arrayMove(list, oldIdx, newIdx) };
    });

    // Persist with the just-computed state.
    setGrouped((prev) => {
      // Optimistically update cached list so AllTasksPage etc. see new order.
      qc.setQueryData<Task[]>(["projects", id, "tasks"], (old) => {
        if (!old) return old;
        const next: Task[] = [];
        for (const s of STATUS_ORDER) {
          prev[s].forEach((t, i) => {
            const existing = old.find((o) => o.id === t.id);
            if (existing) {
              next.push({ ...existing, status: s, position: i });
            }
          });
        }
        // Preserve any tasks not in the columns (subtasks etc.)
        for (const o of old) {
          if (!next.some((n) => n.id === o.id)) next.push(o);
        }
        return next;
      });

      reorder.mutate({
        projectId: id,
        columns: {
          todo: prev.todo.map((t) => t.id),
          in_progress: prev.in_progress.map((t) => t.id),
          done: prev.done.map((t) => t.id),
        },
      });
      return prev;
    });
    dragStartSnapshot.current = null;
  }

  function handleDragCancel() {
    setActiveId(null);
    if (dragStartSnapshot.current) setGrouped(dragStartSnapshot.current);
    dragStartSnapshot.current = null;
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
          onDragOver={handleDragOver}
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
