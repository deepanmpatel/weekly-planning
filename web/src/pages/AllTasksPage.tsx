import { useMemo, useState } from "react";
import { useAllTasks, useProjects } from "../lib/api";
import { TaskCard } from "../components/TaskCard";
import { TaskDrawer } from "../components/TaskDrawer";
import type { Status, Task } from "../lib/types";
import { STATUS_LABEL, STATUS_ORDER } from "../lib/types";
import clsx from "clsx";

type Filter = "all" | Status;

export function AllTasksPage() {
  const { data: tasks = [], isLoading, error } = useAllTasks();
  const { data: projects = [], error: projectsError } = useProjects();
  const [filter, setFilter] = useState<Filter>("all");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [includeSubtasks, setIncludeSubtasks] = useState(false);

  const subtasksByParent = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.parent_task_id) continue;
      const arr = map.get(t.parent_task_id) ?? [];
      arr.push(t);
      map.set(t.parent_task_id, arr);
    }
    return map;
  }, [tasks]);

  const parentName = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tasks) if (!t.parent_task_id) map.set(t.id, t.name);
    return map;
  }, [tasks]);

  const filtered = useMemo(() => {
    return tasks
      .filter((t) => {
        if (!includeSubtasks && t.parent_task_id) return false;
        if (filter !== "all" && t.status !== filter) return false;
        return true;
      })
      .map((t) =>
        t.parent_task_id
          ? t
          : { ...t, subtasks: subtasksByParent.get(t.id) ?? [] }
      );
  }, [tasks, filter, includeSubtasks, subtasksByParent]);

  const byProject = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of filtered) {
      const key = t.project_id;
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    // Within each project, sort by status (To-Do → In Progress → Done),
    // then by position (matches the project page's drag order),
    // then by creation time as a stable tiebreaker.
    const statusRank: Record<Task["status"], number> = {
      todo: 0,
      in_progress: 1,
      waiting_for_reply: 2,
      done: 3,
    };
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.status !== b.status) return statusRank[a.status] - statusRank[b.status];
        if (a.status === "done") {
          const ad = a.completed_at;
          const bd = b.completed_at;
          if (ad && bd) return bd.localeCompare(ad);
          if (ad) return -1;
          if (bd) return 1;
          return 0;
        }
        if (a.position !== b.position) return a.position - b.position;
        return a.created_at.localeCompare(b.created_at);
      });
    }
    return map;
  }, [filtered]);

  const ordered = projects
    .map((p) => ({ project: p, list: byProject.get(p.id) ?? [] }))
    .filter((g) => g.list.length > 0);

  const counts = tasks.reduce(
    (acc, t) => {
      if (!includeSubtasks && t.parent_task_id) return acc;
      acc.all += 1;
      acc[t.status] += 1;
      return acc;
    },
    { all: 0, todo: 0, in_progress: 0, waiting_for_reply: 0, done: 0 } as Record<
      Filter,
      number
    >
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-start justify-between gap-4 border-b border-ink-200 bg-white px-6 py-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            Overview
          </div>
          <h1 className="text-xl font-semibold text-ink-900">All Tasks</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ink-700">
            <input
              type="checkbox"
              checked={includeSubtasks}
              onChange={(e) => setIncludeSubtasks(e.target.checked)}
            />
            Include subtasks
          </label>
          <div className="flex rounded-lg border border-ink-200 bg-white p-0.5 text-xs">
            {(["all", ...STATUS_ORDER] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={clsx(
                  "rounded-md px-2.5 py-1 font-medium",
                  filter === f
                    ? "bg-ink-900 text-white"
                    : "text-ink-700 hover:bg-ink-100"
                )}
              >
                {f === "all" ? "All" : STATUS_LABEL[f]}{" "}
                <span className="tabular-nums opacity-70">{counts[f]}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {(error || projectsError) && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <div className="font-semibold">Couldn't load data</div>
            <div className="mt-1 font-mono text-xs">
              {(error ?? projectsError)?.message}
            </div>
            <div className="mt-2 text-xs text-rose-700">
              If this is localhost, make sure <code>http://localhost:5173</code>{" "}
              is in Supabase → Authentication → URL Configuration → Redirect URLs,
              then sign out and sign back in.
            </div>
          </div>
        )}
        {isLoading && (
          <div className="text-sm text-ink-500">Loading tasks…</div>
        )}
        {!isLoading && !error && ordered.length === 0 && (
          <div className="rounded-lg border border-dashed border-ink-200 p-8 text-center text-sm text-ink-500">
            No tasks match the current filter.
          </div>
        )}
        <div className="space-y-6">
          {ordered.map(({ project, list }) => (
            <section key={project.id}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-900">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                {project.name}
                <span className="text-xs font-normal tabular-nums text-ink-500">
                  {list.length}
                </span>
              </h2>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {list.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    showProject={false}
                    isSubtask={!!t.parent_task_id}
                    parentName={
                      t.parent_task_id
                        ? parentName.get(t.parent_task_id)
                        : undefined
                    }
                    onOpen={() => setOpenTaskId(t.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <TaskDrawer
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
        onOpenChild={(t) => setOpenTaskId(t.id)}
      />
    </div>
  );
}
