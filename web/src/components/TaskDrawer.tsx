import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  useAddComment,
  useAttachTag,
  useCreateTag,
  useDeleteTask,
  useDetachTag,
  useMe,
  useTags,
  useTask,
  useUpdateTask,
  useUsers,
} from "../lib/api";
import { Avatar } from "./Avatar";
import type { Status, Tag, Task } from "../lib/types";
import { STATUS_LABEL, STATUS_ORDER } from "../lib/types";
import { TagChip } from "./TagChip";
import { TaskCard } from "./TaskCard";
import { NewTaskInline } from "./NewTaskInline";
import { Activity } from "./Activity";

export function TaskDrawer({
  taskId,
  onClose,
  onOpenChild,
}: {
  taskId: string | null;
  onClose: () => void;
  onOpenChild?: (t: Task) => void;
}) {
  const open = !!taskId;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      className={clsx(
        "fixed inset-0 z-40 transition",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
      aria-hidden={!open}
    >
      <div
        className={clsx(
          "absolute inset-0 bg-ink-900/20 transition-opacity",
          open ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      <aside
        className={clsx(
          "absolute right-0 top-0 h-full w-full max-w-[560px] transform bg-white shadow-2xl transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {taskId && (
          <DrawerContent
            taskId={taskId}
            onClose={onClose}
            onOpenChild={onOpenChild}
          />
        )}
      </aside>
    </div>
  );
}

function DrawerContent({
  taskId,
  onClose,
  onOpenChild,
}: {
  taskId: string;
  onClose: () => void;
  onOpenChild?: (t: Task) => void;
}) {
  const { data: task, isLoading } = useTask(taskId);
  const update = useUpdateTask();
  const del = useDeleteTask();
  const addComment = useAddComment();
  const { data: allTags = [] } = useTags();
  const { data: users = [] } = useUsers();
  const { data: me } = useMe();
  const createTag = useCreateTag();
  const attachTag = useAttachTag();
  const detachTag = useDetachTag();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [comment, setComment] = useState("");
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  useEffect(() => {
    if (task) {
      setName(task.name);
      setDescription(task.description ?? "");
    }
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !task) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-500">
        Loading…
      </div>
    );
  }

  function persistName() {
    if (name.trim() && name !== task!.name) {
      update.mutate({ id: task!.id, patch: { name: name.trim() } });
    }
  }
  function persistDescription() {
    if (description !== task!.description) {
      update.mutate({ id: task!.id, patch: { description } });
    }
  }

  const availableTags = allTags.filter(
    (t: Tag) => !task.tags?.some((tt) => tt.id === t.id)
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-ink-200 px-5 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-ink-500">
            {task.parent_task_id ? "Subtask" : "Task"}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              if (confirm(`Delete "${task.name}"?`)) {
                del.mutate(task.id);
                onClose();
              }
            }}
            className="rounded-md px-2 py-1 text-xs text-ink-500 hover:bg-rose-50 hover:text-rose-700"
          >
            Delete
          </button>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-ink-500 hover:bg-ink-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Title */}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={persistName}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="w-full rounded-md border border-transparent px-2 py-1 text-lg font-semibold text-ink-900 hover:border-ink-200 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />

        {/* Meta row */}
        <div className="grid grid-cols-[120px_1fr] gap-y-3 text-sm">
          <label className="pt-1 text-xs font-medium text-ink-500">
            Status
          </label>
          <select
            value={task.status}
            onChange={(e) =>
              update.mutate({
                id: task.id,
                patch: { status: e.target.value as Status },
              })
            }
            className="w-fit rounded-md border border-ink-200 bg-white px-2 py-1 text-sm"
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>

          <label className="pt-1 text-xs font-medium text-ink-500">
            Due date
          </label>
          <input
            type="date"
            value={task.due_date ?? ""}
            onChange={(e) =>
              update.mutate({
                id: task.id,
                patch: { due_date: e.target.value || null },
              })
            }
            className="w-fit rounded-md border border-ink-200 px-2 py-1 text-sm"
          />

          <label className="pt-1 text-xs font-medium text-ink-500">
            Assignee
          </label>
          <div className="flex items-center gap-2">
            <Avatar user={task.assignee ?? null} size={24} />
            <select
              value={task.assignee_id ?? ""}
              onChange={(e) =>
                update.mutate({
                  id: task.id,
                  patch: { assignee_id: e.target.value || null },
                })
              }
              className="rounded-md border border-ink-200 bg-white px-2 py-1 text-sm"
            >
              <option value="">Unassigned</option>
              {me && (
                <option value={me.id}>
                  {me.display_name ?? me.email} (me)
                </option>
              )}
              {users
                .filter((u) => u.id !== me?.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name ?? u.email}
                  </option>
                ))}
            </select>
            {task.assignee_id && task.assignee_id !== me?.id && (
              <button
                onClick={() =>
                  me &&
                  update.mutate({
                    id: task.id,
                    patch: { assignee_id: me.id },
                  })
                }
                className="rounded-md border border-ink-200 px-2 py-1 text-[11px] text-ink-700 hover:bg-ink-100"
                title="Assign to me"
              >
                Take
              </button>
            )}
          </div>

          <label className="pt-1 text-xs font-medium text-ink-500">Tags</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {task.tags?.map((t) => (
              <TagChip
                key={t.id}
                tag={t}
                onRemove={() =>
                  detachTag.mutate({ taskId: task.id, tagId: t.id })
                }
              />
            ))}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTagMenu((x) => !x)}
                className="rounded-full border border-dashed border-ink-300 px-2 py-0.5 text-[11px] text-ink-500 hover:border-ink-500 hover:text-ink-700"
              >
                + Tag
              </button>
              {showTagMenu && (
                <div className="absolute left-0 top-7 z-10 w-56 rounded-lg border border-ink-200 bg-white p-2 shadow-lg">
                  <div className="max-h-40 space-y-0.5 overflow-y-auto">
                    {availableTags.length === 0 && (
                      <div className="px-2 py-1 text-xs text-ink-500">
                        No more tags. Create one below.
                      </div>
                    )}
                    {availableTags.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          attachTag.mutate({ taskId: task.id, tagId: t.id });
                          setShowTagMenu(false);
                        }}
                        className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-ink-100"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: t.color }}
                        />
                        {t.name}
                      </button>
                    ))}
                  </div>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const n = newTagName.trim();
                      if (!n) return;
                      const created = await createTag.mutateAsync({ name: n });
                      attachTag.mutate({ taskId: task.id, tagId: created.id });
                      setNewTagName("");
                      setShowTagMenu(false);
                    }}
                    className="mt-2 flex gap-1 border-t border-ink-200 pt-2"
                  >
                    <input
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder="New tag…"
                      className="w-full rounded border border-ink-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    <button
                      type="submit"
                      className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      disabled={!newTagName.trim()}
                    >
                      Create
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <div className="mb-1 text-xs font-medium text-ink-500">
            Description
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={persistDescription}
            placeholder="Add details…"
            rows={Math.max(3, description.split("\n").length)}
            className="w-full resize-y rounded-md border border-ink-200 px-3 py-2 text-sm placeholder:text-ink-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* Subtasks */}
        {!task.parent_task_id && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-medium text-ink-500">
                Subtasks {task.subtasks?.length ? `(${task.subtasks.length})` : ""}
              </div>
            </div>
            {task.subtasks && task.subtasks.length > 0 && (
              <div className="relative pl-5">
                <div
                  className="pointer-events-none absolute left-1 top-2 bottom-2 w-px bg-indigo-200"
                  aria-hidden="true"
                />
                <div className="space-y-1.5">
                  {task.subtasks.map((s) => (
                    <div key={s.id} className="relative">
                      <div
                        className="pointer-events-none absolute -left-4 top-1/2 h-px w-4 bg-indigo-200"
                        aria-hidden="true"
                      />
                      <TaskCard
                        task={s}
                        compact
                        isSubtask
                        onOpen={() => onOpenChild?.(s)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-2">
              <NewTaskInline
                projectId={task.project_id}
                parentTaskId={task.id}
                placeholder="Add subtask…"
              />
            </div>
          </div>
        )}

        {/* Comments */}
        <div>
          <div className="mb-2 text-xs font-medium text-ink-500">
            Comments {task.comments?.length ? `(${task.comments.length})` : ""}
          </div>
          <div className="space-y-2">
            {task.comments?.map((c) => (
              <div
                key={c.id}
                className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-sm"
              >
                <div className="whitespace-pre-wrap text-ink-900">{c.body}</div>
                <div className="mt-1 text-[10px] text-ink-500">
                  {new Date(c.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const b = comment.trim();
              if (!b) return;
              await addComment.mutateAsync({ taskId: task.id, body: b });
              setComment("");
            }}
            className="mt-2 flex gap-2"
          >
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment…"
              className="w-full rounded-md border border-ink-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            <button
              type="submit"
              disabled={!comment.trim() || addComment.isPending}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Post
            </button>
          </form>
        </div>

        {/* Activity */}
        <div>
          <div className="mb-2 text-xs font-medium text-ink-500">
            Activity {task.events?.length ? `(${task.events.length})` : ""}
          </div>
          <Activity events={task.events ?? []} />
        </div>
      </div>
    </div>
  );
}
