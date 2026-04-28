import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  useProjects,
  useReorderProjects,
  useReorderTodayCell,
  useTodayTasks,
  useUpdateTask,
} from "../lib/api";
import type { Project, Status, Task } from "../lib/types";
import { STATUS_LABEL, STATUS_ORDER } from "../lib/types";
import { TaskCard } from "../components/TaskCard";
import { SortableTaskCard } from "../components/SortableTaskCard";
import { TaskDrawer } from "../components/TaskDrawer";

const COLUMN_BG: Record<Status, string> = {
  todo: "bg-ink-100/60",
  in_progress: "bg-amber-50",
  waiting_for_reply: "bg-sky-50",
  done: "bg-emerald-50",
};

type CellMap = Record<Status, Task[]>;

function emptyCells(): CellMap {
  return { todo: [], in_progress: [], waiting_for_reply: [], done: [] };
}

function projectColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 55% 48%)`;
}

function cellId(projectId: string, status: Status): string {
  return `cell:${projectId}:${status}`;
}

function parseCellId(id: string): { project_id: string; status: Status } | null {
  if (!id.startsWith("cell:")) return null;
  const [, project_id, status] = id.split(":");
  if (!project_id || !STATUS_ORDER.includes(status as Status)) return null;
  return { project_id, status: status as Status };
}

function Cell({
  project,
  status,
  tasks,
  onOpen,
}: {
  project: Project;
  status: Status;
  tasks: Task[];
  onOpen: (t: Task) => void;
}) {
  const id = cellId(project.id, status);
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { kind: "cell", project_id: project.id, status },
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

function ProjectRow({
  project,
  cells,
  onOpen,
}: {
  project: Project;
  cells: CellMap;
  onOpen: (t: Task) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id, data: { kind: "project" } });

  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(0px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const total = STATUS_ORDER.reduce((acc, s) => acc + cells[s].length, 0);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-xl border border-ink-200 bg-white p-3 shadow-card"
    >
      <div className="mb-2 flex items-center gap-2 px-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${project.name}`}
          title="Drag to reorder project"
          className="flex h-6 w-3 shrink-0 cursor-grab items-center justify-center rounded text-ink-300 hover:text-ink-700 active:cursor-grabbing"
        >
          <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor">
            <circle cx="2" cy="3" r="1" />
            <circle cx="2" cy="7" r="1" />
            <circle cx="2" cy="11" r="1" />
            <circle cx="6" cy="3" r="1" />
            <circle cx="6" cy="7" r="1" />
            <circle cx="6" cy="11" r="1" />
          </svg>
        </button>
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: projectColor(project.id) }}
        />
        <h2 className="text-sm font-semibold text-ink-900">{project.name}</h2>
        <span className="text-[11px] tabular-nums text-ink-500">{total}</span>
      </div>
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
              project={project}
              status={s}
              tasks={cells[s]}
              onOpen={onOpen}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TodayPage() {
  const { data: tasks = [], isLoading, error } = useTodayTasks();
  const { data: projects = [] } = useProjects();
  const reorderProjects = useReorderProjects();
  const reorderTodayCell = useReorderTodayCell();
  const updateTask = useUpdateTask();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeKind, setActiveKind] = useState<"project" | "task" | null>(null);

  const grouped = useMemo(() => {
    const out: Record<string, CellMap> = {};
    for (const t of tasks) {
      if (!out[t.project_id]) out[t.project_id] = emptyCells();
      out[t.project_id][t.status].push(t);
    }
    for (const projectId in out) {
      for (const s of STATUS_ORDER) {
        out[projectId][s].sort((a, b) => {
          if (a.today_position !== b.today_position)
            return a.today_position - b.today_position;
          return a.created_at.localeCompare(b.created_at);
        });
      }
    }
    return out;
  }, [tasks]);

  const projectsWithTasks = useMemo(
    () =>
      projects.filter((p) => {
        const cells = grouped[p.id];
        if (!cells) return false;
        return STATUS_ORDER.some((s) => cells[s].length > 0);
      }),
    [projects, grouped]
  );

  const projectIds = useMemo(
    () => projectsWithTasks.map((p) => p.id),
    [projectsWithTasks]
  );

  const tasksById = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of tasks) m.set(t.id, t);
    return m;
  }, [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const activeTask =
    activeKind === "task" && activeId ? tasksById.get(activeId) ?? null : null;

  function findTaskCell(
    taskId: string
  ): { project_id: string; status: Status } | null {
    const t = tasksById.get(taskId);
    if (!t) return null;
    return { project_id: t.project_id, status: t.status };
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveId(id);
    const kind = event.active.data.current?.kind;
    setActiveKind(kind === "project" ? "project" : "task");
  }

  function handleDragCancel() {
    setActiveId(null);
    setActiveKind(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setActiveKind(null);
    if (!over) return;

    const activeData = active.data.current as { kind?: string } | undefined;

    if (activeData?.kind === "project") {
      if (active.id === over.id) return;
      const oldIdx = projectsWithTasks.findIndex((p) => p.id === active.id);
      const newIdx = projectsWithTasks.findIndex((p) => p.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return;
      const reordered = arrayMove(projectsWithTasks, oldIdx, newIdx);
      const reorderedIds = reordered.map((p) => p.id);
      const remaining = projects
        .filter((p) => !reorderedIds.includes(p.id))
        .map((p) => p.id);
      reorderProjects.mutate([...reorderedIds, ...remaining]);
      return;
    }

    const activeCell = findTaskCell(String(active.id));
    if (!activeCell) return;

    const overData = over.data.current as
      | { kind?: string; project_id?: string; status?: Status }
      | undefined;

    let destProjectId: string | undefined;
    let destStatus: Status | undefined;
    if (overData?.kind === "cell") {
      destProjectId = overData.project_id;
      destStatus = overData.status;
    } else if (overData?.kind === "task") {
      const destCell = findTaskCell(String(over.id));
      if (destCell) {
        destProjectId = destCell.project_id;
        destStatus = destCell.status;
      }
    } else {
      const parsed = parseCellId(String(over.id));
      if (parsed) {
        destProjectId = parsed.project_id;
        destStatus = parsed.status;
      } else {
        const destCell = findTaskCell(String(over.id));
        if (destCell) {
          destProjectId = destCell.project_id;
          destStatus = destCell.status;
        }
      }
    }

    if (!destProjectId || !destStatus) return;

    if (activeCell.project_id !== destProjectId) return;

    const sourceList = grouped[activeCell.project_id]?.[activeCell.status] ?? [];
    const destList = grouped[destProjectId]?.[destStatus] ?? [];

    if (
      activeCell.project_id === destProjectId &&
      activeCell.status === destStatus
    ) {
      const oldIdx = sourceList.findIndex((t) => t.id === active.id);
      const overTaskIdx = sourceList.findIndex((t) => t.id === over.id);
      const newIdx = overTaskIdx === -1 ? sourceList.length - 1 : overTaskIdx;
      if (oldIdx === -1 || oldIdx === newIdx) return;
      const reordered = arrayMove(sourceList, oldIdx, newIdx);
      reorderTodayCell.mutate({
        project_id: destProjectId,
        status: destStatus,
        ids: reordered.map((t) => t.id),
      });
      return;
    }

    const moving = sourceList.find((t) => t.id === active.id);
    if (!moving) return;

    const overTaskIdx = destList.findIndex((t) => t.id === over.id);
    const insertIdx = overTaskIdx === -1 ? destList.length : overTaskIdx;
    const newDest = [
      ...destList.slice(0, insertIdx),
      moving,
      ...destList.slice(insertIdx),
    ];

    updateTask.mutate({
      id: moving.id,
      patch: { status: destStatus },
    });
    reorderTodayCell.mutate({
      project_id: destProjectId,
      status: destStatus,
      ids: newDest.map((t) => t.id),
    });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-ink-200 bg-white px-6 py-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            Overview
          </div>
          <h1 className="text-xl font-semibold text-ink-900">Today</h1>
        </div>
        <div className="text-xs text-ink-500 tabular-nums">
          {tasks.length} tasks
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <div className="font-semibold">Couldn't load Today</div>
            <div className="mt-1 font-mono text-xs">{error.message}</div>
          </div>
        )}
        {isLoading ? (
          <div className="text-sm text-ink-500">Loading…</div>
        ) : projectsWithTasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink-200 p-8 text-center text-sm text-ink-500">
            No tasks flagged for Today. Tap the star on any task to add it.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={projectIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {projectsWithTasks.map((p) => (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    cells={grouped[p.id] ?? emptyCells()}
                    onOpen={(t) => setOpenTaskId(t.id)}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeTask ? <TaskCard task={activeTask} /> : null}
            </DragOverlay>
          </DndContext>
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
