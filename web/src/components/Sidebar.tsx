import { useState } from "react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { useCreateProject, useMe, useProjects } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Avatar } from "./Avatar";

export function Sidebar() {
  const { data: projects = [], isLoading } = useProjects();
  const { data: me } = useMe();
  const { signOut } = useAuth();
  const create = useCreateProject();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    await create.mutateAsync(name);
    setNewName("");
    setAdding(false);
  }

  const linkClass = (isActive: boolean) =>
    clsx(
      "flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition",
      isActive
        ? "bg-blue-50 font-medium text-blue-800"
        : "text-ink-700 hover:bg-ink-100"
    );

  return (
    <aside className="flex h-full w-64 flex-col border-r border-ink-200 bg-white/60 backdrop-blur">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="h-7 w-7 rounded-md bg-blue-600" />
        <div>
          <div className="text-sm font-semibold">Weekly Planning</div>
          <div className="text-[11px] text-ink-500">personal board</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <NavLink
          to="/"
          end
          className={({ isActive }) => linkClass(isActive)}
        >
          <span>All Tasks</span>
        </NavLink>

        {me?.is_admin && (
          <NavLink
            to="/admin"
            className={({ isActive }) => linkClass(isActive)}
          >
            <span>Admin</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
              ⚙
            </span>
          </NavLink>
        )}

        <div className="mt-4 flex items-center justify-between px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
          <span>Projects</span>
          <button
            type="button"
            onClick={() => setAdding((x) => !x)}
            className="rounded text-ink-500 hover:bg-ink-100 hover:text-ink-700"
            aria-label="Add project"
          >
            <span className="inline-block h-5 w-5 text-center leading-5">+</span>
          </button>
        </div>

        {adding && (
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

        <div className="space-y-0.5">
          {isLoading && <div className="px-2.5 text-xs text-ink-500">Loading…</div>}
          {projects.map((p) => (
            <NavLink
              key={p.id}
              to={`/projects/${p.id}`}
              className={({ isActive }) => linkClass(isActive)}
            >
              <span className="truncate">{p.name}</span>
              <span className="ml-2 text-[11px] tabular-nums text-ink-500">
                {p.done_count ?? 0}/{p.task_count ?? 0}
              </span>
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="flex items-center gap-2 border-t border-ink-200 px-3 py-3">
        <Avatar user={me ?? null} size={28} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-ink-900">
            {me?.display_name ?? me?.email ?? "You"}
          </div>
          <div className="truncate text-[10px] text-ink-500">{me?.email}</div>
        </div>
        <button
          onClick={() => signOut()}
          className="rounded-md px-2 py-1 text-[11px] text-ink-500 hover:bg-ink-100 hover:text-ink-900"
          title="Sign out"
        >
          ⎋
        </button>
      </div>
    </aside>
  );
}
