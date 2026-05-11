import { useMemo, useRef, useState } from "react";
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
  usePrioritizedTasks,
  useReorderPrioritized,
  useUpdateTask,
} from "../lib/api";
import type { Bucket, Status, Task } from "../lib/types";
import { STATUS_LABEL, STATUS_ORDER } from "../lib/types";
import {
  applyPrioritizedCellReorderToCache,
  applyPrioritizedCrossCellMoveToCache,
  sortDoneByCompletedAt,
} from "../lib/dragLogic";
import { TaskCard } from "../components/TaskCard";
import { SortableTaskCard } from "../components/SortableTaskCard";
import { TaskDrawer } from "../components/TaskDrawer";

const COLUMN_BG: Record<Status, string> = {
  todo: "bg-ink-100/60",
  in_progress: "bg-amber-50",
  waiting_for_reply: "bg-sky-50",
  done: "bg-emerald-50",
};

const BUCKET_LABEL: Record<Bucket, string> = {
  work: "Work",
  non_work: "Non-work",
};

const BUCKET_EMPTY_HINT: Record<Bucket, string> = {
  work: "No work tasks yet. Tag a task with “work” to send it here.",
  non_work: "Nothing here. Tasks without the “work” tag will show up here.",
};

const BUCKETS: Bucket[] = ["work", "non_work"];

type CellMap = Record<Status, Task[]>;

function emptyCells(): CellMap {
  return { todo: [], in_progress: [], waiting_for_reply: [], done: [] };
}

function sortCellForDisplay(tasks: Task[], status: Status): Task[] {
  if (status === "done") return sortDoneByCompletedAt(tasks);
  return [...tasks].sort((a, b) => {
    if (a.prioritized_position !== b.prioritized_position)
      return a.prioritized_position - b.prioritized_position;
    return a.created_at.localeCompare(b.created_at);
  });
}

function cellId(bucket: Bucket, status: Status): string {
  return `cell:${bucket}:${status}`;
}

function parseCellId(id: string): { bucket: Bucket; status: Status } | null {
  if (!id.startsWith("cell:")) return null;
  const [, bucket, status] = id.split(":");
  if (bucket !== "work" && bucket !== "non_work") return null;
  if (!STATUS_ORDER.includes(status as Status)) return null;
  return { bucket: bucket as Bucket, status: status as Status };
}

function Cell({
  bucket,
  status,
  tasks,
  onOpen,
}: {
  bucket: Bucket;
  status: Status;
  tasks: Task[];
  onOpen: (t: Task) => void;
}) {
  const id = cellId(bucket, status);
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { kind: "cell", bucket, status },
  });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[72px] flex-col rounded-lg ${COLUMN_BG[status]} p-2 transition-colors ${
        isOver ? "ring-2 ring-blue-300/60" : ""
      }`}
    >
      <SortableContext
        id={id}
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {tasks.map((t) => (
            <SortableTaskCard
              key={t.id}
              task={t}
              onOpen={onOpen}
              showProject
            />
          ))}
        </div>
      </SortableContext>
      {tasks.length === 0 && (
        <div className="rounded-md border border-dashed border-ink-200 px-3 py-4 text-center text-xs text-ink-500">
          Empty — drop here
        </div>
      )}
    </div>
  );
}

const PRIORITIZED_KEY = ["tasks", "prioritized"] as const;

function BucketCard({
  bucket,
  cells,
  onOpen,
  qc,
  reorderPrioritized,
  updateTask,
  tasksById,
}: {
  bucket: Bucket;
  cells: CellMap;
  onOpen: (t: Task) => void;
  qc: ReturnType<typeof useQueryClient>;
  reorderPrioritized: ReturnType<typeof useReorderPrioritized>;
  updateTask: ReturnType<typeof useUpdateTask>;
  tasksById: Map<string, Task>;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  // Captured on dragStart so cancellation/error can restore the pre-drag cache,
  // and so dragEnd can detect cross-cell status changes.
  const dragStartRef = useRef<{
    cache: Task[] | undefined;
    activeStatus: Status;
  } | null>(null);

  const total = STATUS_ORDER.reduce((acc, s) => acc + cells[s].length, 0);
  const activeTask = activeId ? tasksById.get(activeId) ?? null : null;

  function resolveDestCell(
    cached: Task[],
    over: { id: string | number; data: { current?: unknown } }
  ): { bucket: Bucket; status: Status } | null {
    const overIdStr = String(over.id);
    const overData = over.data.current as
      | { kind?: string; bucket?: Bucket; status?: Status }
      | undefined;
    if (overData?.kind === "cell" && overData.bucket && overData.status) {
      return { bucket: overData.bucket, status: overData.status };
    }
    const overTask = cached.find((t) => t.id === overIdStr);
    if (overTask && overTask.bucket) {
      return { bucket: overTask.bucket, status: overTask.status };
    }
    return parseCellId(overIdStr);
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveId(id);
    const t = tasksById.get(id);
    const cache = qc.getQueryData<Task[]>(PRIORITIZED_KEY);
    dragStartRef.current = t
      ? { cache, activeStatus: t.status }
      : null;
  }

  // Cross-cell drag preview within the same bucket: when the cursor enters
  // a different status cell, move the active task into that cell in the
  // cache. The destination's verticalListSortingStrategy then opens a gap
  // at the hover position. Same-cell moves are handled by useSortable.
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    if (activeIdStr === overIdStr) return;

    const cached = qc.getQueryData<Task[]>(PRIORITIZED_KEY);
    if (!cached) return;
    const activeT = cached.find((t) => t.id === activeIdStr);
    if (!activeT) return;
    if (activeT.bucket !== bucket) return;

    const dest = resolveDestCell(cached, over);
    if (!dest) return;
    if (dest.bucket !== bucket) return; // cross-bucket blocked
    if (dest.status === activeT.status) return; // same cell, useSortable handles

    const destCellTasks = sortCellForDisplay(
      cached.filter(
        (t) =>
          t.bucket === dest.bucket &&
          t.status === dest.status &&
          t.id !== activeIdStr
      ),
      dest.status
    );

    const overData = over.data.current as { kind?: string } | undefined;
    let insertIdx: number;
    if (overData?.kind === "cell") {
      insertIdx = destCellTasks.length;
    } else {
      const overIdx = destCellTasks.findIndex((t) => t.id === overIdStr);
      if (overIdx === -1) {
        insertIdx = destCellTasks.length;
      } else {
        const activeTop = active.rect.current.translated?.top;
        const overMid = over.rect.top + over.rect.height / 2;
        const insertAfter =
          activeTop !== undefined && activeTop > overMid;
        insertIdx = overIdx + (insertAfter ? 1 : 0);
      }
    }

    const newDestIds = [
      ...destCellTasks.slice(0, insertIdx).map((t) => t.id),
      activeIdStr,
      ...destCellTasks.slice(insertIdx).map((t) => t.id),
    ];

    qc.setQueryData<Task[]>(PRIORITIZED_KEY, (old) =>
      applyPrioritizedCrossCellMoveToCache(
        old,
        activeIdStr,
        dest.bucket,
        dest.status,
        newDestIds
      )
    );
  }

  function handleDragCancel() {
    setActiveId(null);
    if (dragStartRef.current?.cache) {
      qc.setQueryData<Task[]>(
        PRIORITIZED_KEY,
        dragStartRef.current.cache
      );
    }
    dragStartRef.current = null;
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) {
      handleDragCancel();
      return;
    }

    const start = dragStartRef.current;
    dragStartRef.current = null;
    if (!start) return;

    const cached = qc.getQueryData<Task[]>(PRIORITIZED_KEY);
    if (!cached) return;
    const activeIdStr = String(active.id);
    const activeT = cached.find((t) => t.id === activeIdStr);
    if (!activeT) return;
    if (activeT.bucket !== bucket) return;

    // After possible dragOver moves, active is in its current cell. Compute
    // final ids for that cell, applying same-cell reorder if dropped on a
    // task within it.
    const cellTasks = sortCellForDisplay(
      cached.filter(
        (t) => t.bucket === bucket && t.status === activeT.status
      ),
      activeT.status
    );

    const overIdStr = String(over.id);
    const overTask = cached.find((t) => t.id === overIdStr);
    let finalCellTasks = cellTasks;
    if (
      overTask &&
      overTask.id !== activeIdStr &&
      overTask.bucket === bucket &&
      overTask.status === activeT.status
    ) {
      const oldIdx = cellTasks.findIndex((t) => t.id === activeIdStr);
      const newIdx = cellTasks.findIndex((t) => t.id === overTask.id);
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        finalCellTasks = arrayMove(cellTasks, oldIdx, newIdx);
      }
    }
    const finalCellIds = finalCellTasks.map((t) => t.id);

    qc.setQueryData<Task[]>(PRIORITIZED_KEY, (old) =>
      applyPrioritizedCellReorderToCache(
        old,
        bucket,
        activeT.status,
        finalCellIds
      )
    );

    const statusChanged = activeT.status !== start.activeStatus;
    if (statusChanged) {
      // Sequence the mutations so the backend reorder sees the updated
      // status. Both fire in the background; UI is already up to date.
      updateTask.mutate(
        { id: activeIdStr, patch: { status: activeT.status } },
        {
          onSuccess: () => {
            reorderPrioritized.mutate({
              bucket,
              status: activeT.status,
              ids: finalCellIds,
            });
          },
        }
      );
    } else {
      const startCellTasks = sortCellForDisplay(
        (start.cache ?? []).filter(
          (t) => t.bucket === bucket && t.status === activeT.status
        ),
        activeT.status
      );
      const startIds = startCellTasks.map((t) => t.id);
      const orderUnchanged =
        startIds.length === finalCellIds.length &&
        startIds.every((id, i) => id === finalCellIds[i]);
      if (orderUnchanged) return;
      reorderPrioritized.mutate({
        bucket,
        status: activeT.status,
        ids: finalCellIds,
      });
    }
  }

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-3 shadow-card">
      <div className="mb-2 flex items-center gap-2 px-1">
        <h2 className="text-sm font-semibold text-ink-900">
          {BUCKET_LABEL[bucket]}
        </h2>
        <span className="text-[11px] tabular-nums text-ink-500">{total}</span>
      </div>
      {total === 0 ? (
        <div className="rounded-md border border-dashed border-ink-200 px-3 py-6 text-center text-xs text-ink-500">
          {BUCKET_EMPTY_HINT[bucket]}
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
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            {STATUS_ORDER.map((s) => (
              <div key={s} className="flex flex-col">
                <div className="mb-1 flex items-center justify-between px-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
                    {STATUS_LABEL[s]}
                  </span>
                  <span className="text-[10px] tabular-nums text-ink-500">
                    {cells[s].length}
                  </span>
                </div>
                <Cell
                  bucket={bucket}
                  status={s}
                  tasks={cells[s]}
                  onOpen={onOpen}
                />
              </div>
            ))}
          </div>
          <DragOverlay>
            {activeTask ? <TaskCard task={activeTask} showProject /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

export default function PrioritizedPage() {
  const { data: tasks = [], isLoading, error } = usePrioritizedTasks();
  const reorderPrioritized = useReorderPrioritized();
  const updateTask = useUpdateTask();
  const qc = useQueryClient();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const grouped = useMemo<Record<Bucket, CellMap>>(() => {
    const out: Record<Bucket, CellMap> = {
      work: emptyCells(),
      non_work: emptyCells(),
    };
    for (const t of tasks) {
      const b: Bucket = t.bucket === "work" ? "work" : "non_work";
      out[b][t.status].push(t);
    }
    for (const b of BUCKETS) {
      for (const s of STATUS_ORDER) {
        out[b][s] = sortCellForDisplay(out[b][s], s);
      }
    }
    return out;
  }, [tasks]);

  const tasksById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of tasks) m.set(t.id, t);
    return m;
  }, [tasks]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-ink-200 bg-white px-6 py-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            Overview
          </div>
          <h1 className="text-xl font-semibold text-ink-900">Prioritized</h1>
        </div>
        <div className="text-xs text-ink-500 tabular-nums">
          {tasks.length} tasks
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <div className="font-semibold">Couldn't load Prioritized</div>
            <div className="mt-1 font-mono text-xs">{error.message}</div>
          </div>
        )}
        {isLoading ? (
          <div className="text-sm text-ink-500">Loading…</div>
        ) : (
          <div className="space-y-4">
            {BUCKETS.map((b) => (
              <BucketCard
                key={b}
                bucket={b}
                cells={grouped[b]}
                onOpen={(t) => setOpenTaskId(t.id)}
                qc={qc}
                reorderPrioritized={reorderPrioritized}
                updateTask={updateTask}
                tasksById={tasksById}
              />
            ))}
          </div>
        )}
      </div>

      <TaskDrawer
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
        onOpenChild={(t) => setOpenTaskId(t.id)}
      />
    </div>
  );
}
