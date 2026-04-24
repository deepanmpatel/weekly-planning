import clsx from "clsx";
import type { Task } from "../lib/types";
import { StatusSelect } from "./StatusPill";
import { TagChip } from "./TagChip";
import { useUpdateTask } from "../lib/api";
import { Avatar } from "./Avatar";

function fmtDue(iso: string | null): { text: string; overdue: boolean } | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = d < today;
  const text = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
  return { text, overdue };
}

function subtaskBadge(task: Task): string | null {
  const subs = task.subtasks;
  if (!subs || subs.length === 0) return null;
  const done = subs.filter((s) => s.status === "done").length;
  return `${done}/${subs.length} done`;
}

export function TaskCard({
  task,
  onOpen,
  compact,
  showProject,
}: {
  task: Task;
  onOpen?: (task: Task) => void;
  compact?: boolean;
  showProject?: boolean;
}) {
  const update = useUpdateTask();
  const due = fmtDue(task.due_date);
  const subBadge = subtaskBadge(task);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(task)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen?.(task);
      }}
      className={clsx(
        "group cursor-pointer rounded-lg border border-ink-200 bg-white shadow-card transition hover:border-ink-300 hover:shadow-hover",
        compact ? "p-2" : "p-3",
        task.status === "done" && "opacity-75"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div
            className={clsx(
              "font-medium leading-snug text-ink-900",
              compact ? "text-[13px]" : "text-sm",
              task.status === "done" && "line-through text-ink-500"
            )}
          >
            {task.name}
          </div>
          {!compact && task.description && (
            <p className="mt-1 line-clamp-2 text-xs text-ink-500 whitespace-pre-line">
              {task.description}
            </p>
          )}
          {(task.tags?.length || subBadge || due || showProject) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {showProject && task.project_name && (
                <span className="inline-flex items-center gap-1 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-700">
                  {task.project_name}
                </span>
              )}
              {due && (
                <span
                  className={clsx(
                    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                    due.overdue && task.status !== "done"
                      ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
                      : "bg-ink-100 text-ink-700"
                  )}
                >
                  📅 {due.text}
                </span>
              )}
              {subBadge && (
                <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
                  ⋯ {subBadge}
                </span>
              )}
              {task.tags?.map((t) => (
                <TagChip key={t.id} tag={t} compact />
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusSelect
            value={task.status}
            compact={compact}
            onChange={(s) =>
              update.mutate({ id: task.id, patch: { status: s } })
            }
          />
          {task.assignee && (
            <Avatar
              user={task.assignee}
              size={compact ? 18 : 22}
              title={`Assigned to ${task.assignee.display_name ?? task.assignee.email}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
