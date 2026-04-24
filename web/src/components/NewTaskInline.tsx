import { useState } from "react";
import { useCreateTask } from "../lib/api";
import type { Status } from "../lib/types";

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
  const create = useCreateTask();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || create.isPending) return;
    await create.mutateAsync({
      project_id: projectId,
      parent_task_id: parentTaskId,
      name: trimmed,
      status: status ?? "todo",
    });
    setName("");
    onCreated?.();
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm placeholder:text-ink-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
      />
      <button
        type="submit"
        disabled={!name.trim() || create.isPending}
        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Add
      </button>
    </form>
  );
}
