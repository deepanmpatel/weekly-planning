import clsx from "clsx";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Task } from "../lib/types";
import { StatusPill, StatusSelect } from "./StatusPill";
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

function SubtaskIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 4v12a3 3 0 0 0 3 3h9" />
      <path d="M14 15l4 4-4 4" />
    </svg>
  );
}

function SubtaskBadge({ subtasks }: { subtasks: Task[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);

  const total = subtasks.length;
  const done = subtasks.filter((s) => s.status === "done").length;

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setPos({ top: r.top - 6, left: r.left + r.width / 2 });
  }, [open]);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={anchorRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label={`${done} of ${total} subtasks done`}
        className="inline-flex items-center gap-0.5 rounded bg-indigo-50 px-1 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100"
      >
        <SubtaskIcon className="h-3 w-3" />
        <span className="tabular-nums">
          {done}/{total}
        </span>
      </button>
      {open && pos &&
        createPortal(
          <div
            role="tooltip"
            style={{ top: pos.top, left: pos.left }}
            className="pointer-events-none fixed z-50 w-64 -translate-x-1/2 -translate-y-full rounded-lg border border-ink-200 bg-white p-2 shadow-lg"
          >
            <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
              Subtasks · {done}/{total} done
            </div>
            <ul className="max-h-64 space-y-0.5 overflow-y-auto">
              {subtasks.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded px-1 py-1"
                >
                  <span
                    className={clsx(
                      "min-w-0 flex-1 truncate text-xs",
                      s.status === "done"
                        ? "text-ink-500 line-through"
                        : "text-ink-900"
                    )}
                    title={s.name}
                  >
                    {s.name}
                  </span>
                  <StatusPill status={s.status} />
                </li>
              ))}
            </ul>
            <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-b border-r border-ink-200 bg-white" />
          </div>,
          document.body
        )}
    </span>
  );
}

export function TaskCard({
  task,
  onOpen,
  compact,
  showProject,
  isSubtask,
  parentName,
}: {
  task: Task;
  onOpen?: (task: Task) => void;
  compact?: boolean;
  showProject?: boolean;
  isSubtask?: boolean;
  parentName?: string;
}) {
  const update = useUpdateTask();
  const due = fmtDue(task.due_date);
  const subtasks = task.subtasks ?? [];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(task)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen?.(task);
      }}
      className={clsx(
        "group cursor-pointer rounded-lg border shadow-card transition hover:shadow-hover",
        compact ? "p-2" : "p-3",
        isSubtask
          ? "border-indigo-200 border-l-[3px] border-l-indigo-400 bg-indigo-50/40 hover:border-indigo-300 hover:border-l-indigo-500"
          : "border-ink-200 bg-white hover:border-ink-300",
        task.status === "done" && "opacity-75"
      )}
    >
      {isSubtask && parentName && (
        <div className="mb-1 flex items-center gap-1 text-[10px] text-indigo-700/80">
          <span aria-hidden="true">↳</span>
          <span className="truncate" title={`Subtask of ${parentName}`}>
            {parentName}
          </span>
        </div>
      )}
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
          {(task.tags?.length ||
            subtasks.length > 0 ||
            due ||
            showProject ||
            task.estimated_time != null) && (
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
              {task.estimated_time != null && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                  ⏱ {task.estimated_time}
                  {task.estimated_time_unit === "days" ? "d" : "h"}
                </span>
              )}
              {subtasks.length > 0 && <SubtaskBadge subtasks={subtasks} />}
              {task.tags?.map((t) => (
                <TagChip key={t.id} tag={t} compact />
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-pressed={task.is_today}
              title={task.is_today ? "Remove from Today" : "Add to Today"}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                update.mutate({
                  id: task.id,
                  patch: { is_today: !task.is_today },
                });
              }}
              className={clsx(
                "rounded p-0.5 transition hover:bg-ink-100",
                task.is_today ? "text-amber-500" : "text-ink-300 hover:text-ink-500"
              )}
            >
              <svg
                width={compact ? 14 : 16}
                height={compact ? 14 : 16}
                viewBox="0 0 24 24"
                fill={task.is_today ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
            <StatusSelect
              value={task.status}
              compact={compact}
              onChange={(s) =>
                update.mutate({ id: task.id, patch: { status: s } })
              }
            />
          </div>
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
