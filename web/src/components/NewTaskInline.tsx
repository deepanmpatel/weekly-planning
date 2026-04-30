import { useState } from "react";
import clsx from "clsx";
import {
  useAttachTag,
  useCreateTag,
  useCreateTask,
  useTags,
  useUpdateTask,
} from "../lib/api";
import type { EstimatedTimeUnit, Status, Tag } from "../lib/types";
import { TagChip } from "./TagChip";

export function NewTaskInline({
  projectId,
  parentTaskId,
  status,
  placeholder = "Add a task…",
  onCreated,
}: {
  projectId: string;
  parentTaskId?: string;
  status?: Status;
  placeholder?: string;
  onCreated?: () => void;
}) {
  const [name, setName] = useState("");
  const [estimate, setEstimate] = useState("");
  const [unit, setUnit] = useState<EstimatedTimeUnit>("hours");
  const [isToday, setIsToday] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  const create = useCreateTask();
  const update = useUpdateTask();
  const attach = useAttachTag();
  const createTag = useCreateTag();
  const { data: allTags = [] } = useTags();

  const selectedTags = allTags.filter((t) => selectedTagIds.includes(t.id));
  const availableTags = allTags.filter((t) => !selectedTagIds.includes(t.id));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || create.isPending) return;
    const estimateNum = estimate.trim() === "" ? null : Number(estimate);
    const newTask = await create.mutateAsync({
      project_id: projectId,
      parent_task_id: parentTaskId,
      name: trimmed,
      status: status ?? "todo",
      estimated_time:
        estimateNum !== null && Number.isFinite(estimateNum) ? estimateNum : null,
      estimated_time_unit: unit,
    });
    const followUps: Promise<unknown>[] = [];
    if (isToday) {
      followUps.push(
        update.mutateAsync({ id: newTask.id, patch: { is_today: true } })
      );
    }
    for (const tagId of selectedTagIds) {
      followUps.push(attach.mutateAsync({ taskId: newTask.id, tagId }));
    }
    await Promise.all(followUps);
    setName("");
    setEstimate("");
    setIsToday(false);
    setSelectedTagIds([]);
    setShowTagMenu(false);
    setNewTagName("");
    onCreated?.();
  }

  function addTag(t: Tag) {
    setSelectedTagIds((ids) => (ids.includes(t.id) ? ids : [...ids, t.id]));
    setShowTagMenu(false);
  }

  return (
    <form onSubmit={submit} className="space-y-1.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm placeholder:text-ink-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
      />
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-ink-50 px-2 py-1.5 ring-1 ring-ink-200">
        {/* Estimate */}
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            step={0.25}
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
            placeholder="Est."
            aria-label="Estimated time"
            className="w-16 rounded-md border border-ink-200 bg-white px-2 py-1 text-xs placeholder:text-ink-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as EstimatedTimeUnit)}
            aria-label="Estimated time unit"
            className="rounded-md border border-ink-200 bg-white px-2 py-1 text-xs"
          >
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
        </div>

        <span aria-hidden="true" className="h-5 w-px bg-ink-200" />

        {/* Today */}
        <button
          type="button"
          aria-pressed={isToday}
          title={isToday ? "Today (click to remove)" : "Add to Today"}
          onClick={() => setIsToday((v) => !v)}
          className={clsx(
            "rounded-md p-1 transition hover:bg-white",
            isToday ? "text-amber-500" : "text-ink-400 hover:text-ink-700"
          )}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill={isToday ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>

        <span aria-hidden="true" className="h-5 w-px bg-ink-200" />

        {/* Tags */}
        <div className="relative flex flex-wrap items-center gap-1">
          {selectedTags.map((t) => (
            <TagChip
              key={t.id}
              tag={t}
              compact
              onRemove={() =>
                setSelectedTagIds((ids) => ids.filter((id) => id !== t.id))
              }
            />
          ))}
          <button
            type="button"
            onClick={() => setShowTagMenu((x) => !x)}
            className="rounded-full border border-dashed border-ink-300 bg-white px-2 py-0.5 text-[11px] text-ink-500 hover:border-ink-500 hover:text-ink-700"
          >
            + Tag
          </button>
          {showTagMenu && (
            <div className="absolute left-0 top-7 z-20 w-56 rounded-lg border border-ink-200 bg-white p-2 shadow-lg">
              <div className="max-h-40 space-y-0.5 overflow-y-auto">
                {availableTags.length === 0 && (
                  <div className="px-2 py-1 text-xs text-ink-500">
                    No more tags. Create one below.
                  </div>
                )}
                {availableTags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => addTag(t)}
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
              <div className="mt-2 flex gap-1 border-t border-ink-200 pt-2">
                <input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="New tag…"
                  className="w-full rounded border border-ink-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button
                  type="button"
                  className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  disabled={!newTagName.trim() || createTag.isPending}
                  onClick={async () => {
                    const n = newTagName.trim();
                    if (!n) return;
                    const created = await createTag.mutateAsync({ name: n });
                    addTag(created);
                    setNewTagName("");
                  }}
                >
                  Create
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Add */}
        <button
          type="submit"
          disabled={!name.trim() || create.isPending}
          className="ml-auto rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </form>
  );
}
