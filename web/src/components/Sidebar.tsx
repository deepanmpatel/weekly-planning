import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  useCreateProject,
  useMe,
  useProjects,
  useReorderProjects,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { DEMO_MODE } from "../lib/demoMode";
import { applyProjectsReorderToCache } from "../lib/dragLogic";
import type { Project } from "../lib/types";
import { Avatar } from "./Avatar";

const COLLAPSE_KEY = "weekly-planning:sidebar-collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "true";
  } catch {
    return false;
  }
}

function projectInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function projectColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 55% 48%)`;
}

function SortableProjectLink({
  project,
  collapsed,
  done,
  total,
}: {
  project: Project;
  collapsed: boolean;
  done: number;
  total: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  // Vertical-only drag: ignore the horizontal component of `transform` so the
  // dragged item never slides sideways and never causes horizontal overflow
  // in the sidebar's scroll container.
  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(0px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  // Pattern: NavLink owns clicks (navigation), a dedicated handle owns drag.
  // No need for click-suppression hacks because the two interactions are on
  // distinct elements.
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group relative flex items-center touch-none",
        collapsed ? "justify-center" : "gap-1"
      )}
    >
      {!collapsed && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${project.name}`}
          title="Drag to reorder"
          className="flex h-6 w-3 shrink-0 cursor-grab items-center justify-center rounded text-ink-300 opacity-0 transition group-hover:opacity-100 hover:text-ink-700 focus:opacity-100 active:cursor-grabbing"
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
      )}
      <NavLink
        to={`/projects/${project.id}`}
        title={collapsed ? `${project.name} (${done}/${total})` : undefined}
        className={({ isActive }) =>
          clsx(
            "flex flex-1 items-center gap-2 rounded-md transition",
            collapsed ? "justify-center px-1.5 py-1.5" : "px-2 py-1.5",
            isActive
              ? "bg-blue-50 text-blue-800"
              : "text-ink-700 hover:bg-ink-100"
          )
        }
      >
        {collapsed ? (
          // In collapsed mode the entire avatar IS the drag handle; the link
          // navigates on a clean click and the handle activates after 5px.
          <span
            {...attributes}
            {...listeners}
            className="flex h-7 w-7 cursor-grab items-center justify-center rounded-md text-[10px] font-bold text-white active:cursor-grabbing"
            style={{ backgroundColor: projectColor(project.id) }}
          >
            {projectInitials(project.name)}
          </span>
        ) : (
          <>
            <span className="flex-1 truncate text-sm">{project.name}</span>
            <span className="text-[11px] tabular-nums text-ink-500">
              {done}/{total}
            </span>
          </>
        )}
      </NavLink>
    </div>
  );
}

export function Sidebar() {
  const { data, isLoading } = useProjects();
  const { data: me } = useMe();
  const { signOut } = useAuth();
  const create = useCreateProject();
  const reorderProjects = useReorderProjects();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [collapsed, setCollapsed] = useState(readCollapsed);

  // Derived from cache (NOT useState). When `data` is stable, `projects` is
  // memo-stable. When the cache updates (after a drag), `data` flips and
  // `projects` recomputes — no useEffect+setState loop possible.
  const projects = useMemo<Project[]>(() => data ?? [], [data]);
  // Memoize the SortableContext items prop so its reference is stable
  // across re-renders that don't actually change the project order.
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, String(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Map projects → done/total counts (preserving the existing API contract).
  const counts = useMemo(() => {
    const m = new Map<string, { total: number; done: number }>();
    for (const p of projects) {
      m.set(p.id, { total: p.task_count ?? 0, done: p.done_count ?? 0 });
    }
    return m;
  }, [projects]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    await create.mutateAsync(name);
    setNewName("");
    setAdding(false);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = projects.findIndex((p) => p.id === active.id);
    const newIdx = projects.findIndex((p) => p.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const next = arrayMove(projects, oldIdx, newIdx);
    const orderedIds = next.map((p) => p.id);

    // Sync optimistic write before mutate so the drop animation lands
    // at the new position instead of snapping back.
    qc.setQueryData<Project[]>(["projects"], (old) =>
      applyProjectsReorderToCache(old, orderedIds)
    );
    reorderProjects.mutate(orderedIds);
  }

  const linkClass = (isActive: boolean, justifyCenter = false) =>
    clsx(
      "flex items-center rounded-md transition",
      collapsed
        ? `${justifyCenter ? "justify-center" : ""} px-1.5 py-1.5`
        : "justify-between px-2.5 py-1.5",
      isActive
        ? "bg-blue-50 font-medium text-blue-800"
        : "text-ink-700 hover:bg-ink-100"
    );

  return (
    <aside
      className={clsx(
        "flex h-full flex-col border-r border-ink-200 bg-white/60 backdrop-blur transition-[width] duration-150",
        collapsed ? "w-14" : "w-64"
      )}
    >
      <div
        className={clsx(
          "flex items-center gap-2 px-3 py-4",
          collapsed && "justify-center px-2"
        )}
      >
        <div className="h-7 w-7 shrink-0 rounded-md bg-blue-600" />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              Weekly Planning
              {DEMO_MODE && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">
                  Demo
                </span>
              )}
            </div>
            <div className="text-[11px] text-ink-500">
              {DEMO_MODE
                ? "in-memory data — refresh to reset"
                : "personal board"}
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="rounded-md p-1 text-ink-500 hover:bg-ink-100 hover:text-ink-700"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            {collapsed ? (
              <path d="M5 3l5 5-5 5V3z" />
            ) : (
              <path d="M11 3L6 8l5 5V3z" />
            )}
          </svg>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4">
        <NavLink
          to="/"
          end
          className={({ isActive }) => linkClass(isActive, true)}
          title={collapsed ? "All Tasks" : undefined}
        >
          {collapsed ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 3h12v2H2zm0 4h12v2H2zm0 4h12v2H2z" />
            </svg>
          ) : (
            <span>All Tasks</span>
          )}
        </NavLink>

        <NavLink
          to="/today"
          className={({ isActive }) => linkClass(isActive, true)}
          title={collapsed ? "Today" : undefined}
        >
          {collapsed ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="8" cy="8" r="3" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.4 1.4M11.55 11.55l1.4 1.4M3.05 12.95l1.4-1.4M11.55 4.45l1.4-1.4" />
            </svg>
          ) : (
            <span>Today</span>
          )}
        </NavLink>

        {me?.is_admin && (
          <NavLink
            to="/admin"
            className={({ isActive }) => linkClass(isActive, true)}
            title={collapsed ? "Admin" : undefined}
          >
            {collapsed ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0 7c-3 0-5.5 1.5-5.5 4v1h11v-1c0-2.5-2.5-4-5.5-4z" />
              </svg>
            ) : (
              <>
                <span>Admin</span>
                <span className="text-[10px] uppercase tracking-wide text-ink-500">
                  ⚙
                </span>
              </>
            )}
          </NavLink>
        )}

        {!collapsed && (
          <div className="mt-4 flex items-center justify-between px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            <span>Projects</span>
            <button
              type="button"
              onClick={() => setAdding((x) => !x)}
              className="rounded text-ink-500 hover:bg-ink-100 hover:text-ink-700"
              aria-label="Add project"
            >
              <span className="inline-block h-5 w-5 text-center leading-5">
                +
              </span>
            </button>
          </div>
        )}
        {collapsed && <div className="my-3 border-t border-ink-200" />}

        {adding && !collapsed && (
          <form onSubmit={submit} className="mb-1 flex gap-1 px-1">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Project name"
              className="w-full rounded-md border border-ink-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
              disabled={!newName.trim() || create.isPending}
            >
              Add
            </button>
          </form>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={projectIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-0.5">
              {isLoading && !collapsed && (
                <div className="px-2.5 text-xs text-ink-500">Loading…</div>
              )}
              {projects.map((p) => {
                const c = counts.get(p.id) ?? { total: 0, done: 0 };
                return (
                  <SortableProjectLink
                    key={p.id}
                    project={p}
                    collapsed={collapsed}
                    done={c.done}
                    total={c.total}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </nav>

      <div
        className={clsx(
          "flex items-center gap-2 border-t border-ink-200 py-3",
          collapsed ? "justify-center px-2" : "px-3"
        )}
      >
        <Avatar user={me ?? null} size={28} />
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-ink-900">
                {me?.display_name ?? me?.email ?? "You"}
              </div>
              <div className="truncate text-[10px] text-ink-500">
                {me?.email}
              </div>
            </div>
            <button
              onClick={() => signOut()}
              className="rounded-md px-2 py-1 text-[11px] text-ink-500 hover:bg-ink-100 hover:text-ink-900"
              title="Sign out"
            >
              ⎋
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
