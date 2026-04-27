import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
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
import { SortableTaskCard } from "../components/SortableTaskCard";
import { NewTaskInline } from "../components/NewTaskInline";
import { TaskDrawer } from "../components/TaskDrawer";

const COLUMN_BG: Record<Status, string> = {
  todo: "bg-ink-100/60",
  in_progress: "bg-amber-50",
  done: "bg-emerald-50",
};

function groupByStatus(tasks: Task[]): Record<Status, Task[]> {
  const out: Record<Status, Task[]> = { todo: [], in_progress: [], done: [] };
  for (const t of tasks) out[t.status].push(t);
  return out;
}

export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { data: tasks = [], isLoading } = useProjectTasks(id);
  const { data: projects = [] } = useProjects();
  const reorder = useReorderProjectTasks();
  const qc = useQueryClient();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  // Local copy of grouped tasks; drag-and-drop mutates this for instant feedback.
  const [grouped, setGrouped] = useState<Record<Status, Task[]>>({
    todo: [],
    in_progress: [],
    done: [],
  });

  useEffect(() => {
    setGrouped(groupByStatus(tasks));
  }, [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const project = projects.find((p) => p.id === id);

  function handleDragEnd(status: Status, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !id) return;

    const list = grouped[status];
    const oldIdx = list.findIndex((t) => t.id === active.id);
    const newIdx = list.findIndex((t) => t.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const next = arrayMove(list, oldIdx, newIdx);
    setGrouped((g) => ({ ...g, [status]: next }));

    // Optimistically update the cached project tasks so other UIs see new order.
    qc.setQueryData<Task[]>(["projects", id, "tasks"], (old) => {
      if (!old) return old;
      const updated = old.map((t) => {
        const idx = next.findIndex((n) => n.id === t.id);
        return idx === -1 ? t : { ...t, position: idx };
      });
      return updated;
    });

    reorder.mutate({
      projectId: id,
      status,
      ordered_ids: next.map((t) => t.id),
    });
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
        <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-6 md:grid-cols-3">
          {STATUS_ORDER.map((s) => (
            <section
              key={s}
              className={`flex min-h-0 flex-col rounded-xl ${COLUMN_BG[s]} p-3`}
            >
              <header className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-700">
                  {STATUS_LABEL[s]}
                </h2>
                <span className="text-[11px] tabular-nums text-ink-500">
                  {grouped[s].length}
                </span>
              </header>
              <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(e) => handleDragEnd(s, e)}
                >
                  <SortableContext
                    items={grouped[s].map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {grouped[s].map((t) => (
                      <SortableTaskCard
                        key={t.id}
                        task={t}
                        onOpen={() => setOpenTaskId(t.id)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                {grouped[s].length === 0 && (
                  <div className="rounded-md border border-dashed border-ink-200 px-3 py-6 text-center text-xs text-ink-500">
                    Empty
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      <TaskDrawer
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
        onOpenChild={(t) => setOpenTaskId(t.id)}
      />
    </div>
  );
}
