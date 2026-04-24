import { useParams } from "react-router-dom";
import { useState } from "react";
import { useProjectTasks, useProjects } from "../lib/api";
import type { Status, Task } from "../lib/types";
import { STATUS_LABEL, STATUS_ORDER } from "../lib/types";
import { TaskCard } from "../components/TaskCard";
import { NewTaskInline } from "../components/NewTaskInline";
import { TaskDrawer } from "../components/TaskDrawer";

const COLUMN_BG: Record<Status, string> = {
  todo: "bg-ink-100/60",
  in_progress: "bg-amber-50",
  done: "bg-emerald-50",
};

export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { data: tasks = [], isLoading } = useProjectTasks(id);
  const { data: projects = [] } = useProjects();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const project = projects.find((p) => p.id === id);

  const grouped: Record<Status, Task[]> = {
    todo: [],
    in_progress: [],
    done: [],
  };
  for (const t of tasks) grouped[t.status].push(t);

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
                {grouped[s].map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    onOpen={() => setOpenTaskId(t.id)}
                  />
                ))}
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
