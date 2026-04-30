// In-memory router for demo mode. Mirrors the real API shapes from
// docs/api-contracts.md but holds state in module-level variables — refresh
// the page to reset to seed data.

import type {
  AllowedEmail,
  Comment,
  Profile,
  Project,
  Status,
  Tag,
  Task,
  TaskEvent,
  TaskEventKind,
} from "../types";
import {
  DEMO_ME_ID,
  demoAllowedEmails,
  demoComments,
  demoEvents,
  demoProjects,
  demoTags,
  demoTaskTags,
  demoTasks,
  demoUsers,
} from "./demoData";

let users: Profile[] = clone(demoUsers);
let projects: Project[] = clone(demoProjects);
let tasks: Task[] = clone(demoTasks);
let tags: Tag[] = clone(demoTags);
let taskTags: { task_id: string; tag_id: string }[] = clone(demoTaskTags);
let comments: Comment[] = clone(demoComments);
let events: TaskEvent[] = clone(demoEvents);
let allowedEmails: AllowedEmail[] = clone(demoAllowedEmails);

function clone<T>(value: T): T {
  // JSON.parse(JSON.stringify(undefined)) throws (parse fails on the literal
  // string "undefined"). Every mutation handler that returns 204-equivalent
  // returns `undefined` — so we MUST short-circuit here.
  if (value === undefined) return undefined as T;
  return JSON.parse(JSON.stringify(value));
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function staleDoneCutoffUtcIso(): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value);
  const y = get("year");
  const mo = get("month");
  const d = get("day");
  const h = get("hour") || 0;
  const mi = get("minute") || 0;
  const s = get("second") || 0;
  const utcNow = Date.UTC(y, mo - 1, d, h, mi, s);
  const offsetMs = utcNow - new Date().getTime();

  let cutoff = new Date(Date.UTC(y, mo - 1, d));
  let remaining = 2;
  while (remaining > 0) {
    cutoff = new Date(cutoff.getTime() - 86_400_000);
    const dow = cutoff.getUTCDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  const cutoffMidnightUtc =
    Date.UTC(
      cutoff.getUTCFullYear(),
      cutoff.getUTCMonth(),
      cutoff.getUTCDate()
    ) - offsetMs;
  return new Date(cutoffMidnightUtc).toISOString();
}

function logEvent(
  task_id: string,
  kind: TaskEventKind,
  from_value: string | null = null,
  to_value: string | null = null,
  meta: Record<string, unknown> = {}
) {
  events.unshift({
    id: uid("e"),
    task_id,
    kind,
    from_value,
    to_value,
    meta,
    created_at: nowIso(),
  });
}

function formatEstimate(
  value: number | null | undefined,
  unit: string | null | undefined
): string | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return `${value}${unit === "days" ? "d" : "h"}`;
}

function tagsForTask(taskId: string): Tag[] {
  const ids = taskTags
    .filter((tt) => tt.task_id === taskId)
    .map((tt) => tt.tag_id);
  return tags.filter((t) => ids.includes(t.id));
}

function profileById(id: string | null | undefined): Profile | null {
  if (!id) return null;
  return users.find((u) => u.id === id) ?? null;
}

function projectName(id: string): string | null {
  return projects.find((p) => p.id === id)?.name ?? null;
}

class DemoNotFound extends Error {
  status = 404;
}

class DemoBadRequest extends Error {
  status = 400;
}

class DemoConflict extends Error {
  status = 409;
}

interface Handler {
  method: string;
  pattern: RegExp;
  fn: (match: RegExpMatchArray, body: any) => unknown;
}

const handlers: Handler[] = [
  // --- /users ---
  {
    method: "GET",
    pattern: /^\/users$/,
    fn: () => clone(users),
  },
  {
    method: "GET",
    pattern: /^\/users\/me$/,
    fn: () => clone(users.find((u) => u.id === DEMO_ME_ID)!),
  },

  // --- /projects ---
  {
    method: "GET",
    pattern: /^\/projects$/,
    fn: () =>
      projects
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((p) => {
          const projTasks = tasks.filter(
            (t) => t.project_id === p.id && !t.parent_task_id
          );
          return {
            ...p,
            task_count: projTasks.length,
            done_count: projTasks.filter((t) => t.status === "done").length,
          };
        }),
  },
  {
    method: "POST",
    pattern: /^\/projects$/,
    fn: (_m, body) => {
      const name = String(body?.name ?? "").trim();
      if (!name) throw new DemoBadRequest("name required");
      const project: Project = {
        id: uid("p"),
        name,
        position: (projects.at(-1)?.position ?? 0) + 1,
        created_at: nowIso(),
      };
      projects.push(project);
      return clone(project);
    },
  },
  {
    method: "PATCH",
    pattern: /^\/projects\/([^/]+)$/,
    fn: ([, id], body) => {
      const proj = projects.find((p) => p.id === id);
      if (!proj) throw new DemoNotFound("project not found");
      if (typeof body?.name === "string") proj.name = body.name;
      if (typeof body?.position === "number") proj.position = body.position;
      return clone(proj);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/projects\/([^/]+)$/,
    fn: ([, id]) => {
      projects = projects.filter((p) => p.id !== id);
      const taskIds = tasks
        .filter((t) => t.project_id === id)
        .map((t) => t.id);
      tasks = tasks.filter((t) => t.project_id !== id);
      taskTags = taskTags.filter((tt) => !taskIds.includes(tt.task_id));
      comments = comments.filter((c) => !taskIds.includes(c.task_id));
      events = events.filter((e) => !taskIds.includes(e.task_id));
      return undefined;
    },
  },
  {
    method: "PUT",
    pattern: /^\/projects\/order$/,
    fn: (_m, body) => {
      const orderedIds = (body?.ordered_ids ?? []) as string[];
      orderedIds.forEach((id, position) => {
        const proj = projects.find((p) => p.id === id);
        if (proj) proj.position = position;
      });
      return undefined;
    },
  },

  // --- /projects/:id/tasks ---
  {
    method: "GET",
    pattern: /^\/projects\/([^/]+)\/tasks$/,
    fn: ([, projectId]) => {
      const projTasks = tasks
        .filter((t) => t.project_id === projectId)
        .sort((a, b) => {
          if (a.position !== b.position) return a.position - b.position;
          return a.created_at.localeCompare(b.created_at);
        });

      const byId = new Map<string, any>();
      for (const t of projTasks) {
        byId.set(t.id, {
          ...t,
          tags: tagsForTask(t.id),
          assignee: profileById(t.assignee_id),
          subtasks: [],
        });
      }
      const roots: any[] = [];
      for (const t of byId.values()) {
        if (t.parent_task_id && byId.has(t.parent_task_id)) {
          byId.get(t.parent_task_id).subtasks.push(t);
        } else {
          roots.push(t);
        }
      }
      return roots;
    },
  },
  {
    method: "PUT",
    pattern: /^\/projects\/([^/]+)\/tasks\/reorder$/,
    fn: ([, projectId], body) => {
      const columns = body as Record<Status, string[]>;
      for (const status of [
        "todo",
        "in_progress",
        "waiting_for_reply",
        "done",
      ] as const) {
        const ids = columns[status] ?? [];
        ids.forEach((taskId, position) => {
          const task = tasks.find(
            (t) => t.id === taskId && t.project_id === projectId
          );
          if (!task) return;
          const fromStatus = task.status;
          const statusChanged = fromStatus !== status;
          const positionChanged = task.position !== position;
          if (!statusChanged && !positionChanged) return;
          task.status = status;
          task.position = position;
          if (statusChanged) {
            task.completed_at = status === "done" ? nowIso() : null;
            logEvent(task.id, "status_changed", fromStatus, status);
          }
          task.updated_at = nowIso();
        });
      }
      return undefined;
    },
  },

  // --- /tasks ---
  {
    method: "GET",
    pattern: /^\/tasks$/,
    fn: () =>
      tasks
        .slice()
        .sort((a, b) => {
          if (a.project_id !== b.project_id)
            return a.project_id.localeCompare(b.project_id);
          if (a.position !== b.position) return a.position - b.position;
          return a.created_at.localeCompare(b.created_at);
        })
        .map((t) => ({
          ...t,
          project_name: projectName(t.project_id),
          tags: tagsForTask(t.id),
          assignee: profileById(t.assignee_id),
        })),
  },
  {
    method: "GET",
    pattern: /^\/tasks\/today$/,
    fn: () => {
      const cutoff = staleDoneCutoffUtcIso();
      for (const t of tasks) {
        if (
          t.is_today &&
          t.status === "done" &&
          t.completed_at &&
          t.completed_at < cutoff
        ) {
          t.is_today = false;
        }
      }
      const projPos = new Map<string, number>();
      for (const p of projects) projPos.set(p.id, p.position);
      return tasks
        .filter((t) => t.is_today)
        .slice()
        .sort((a, b) => {
          const pa = projPos.get(a.project_id) ?? 0;
          const pb = projPos.get(b.project_id) ?? 0;
          if (pa !== pb) return pa - pb;
          if (a.today_position !== b.today_position)
            return a.today_position - b.today_position;
          return a.created_at.localeCompare(b.created_at);
        })
        .map((t) => ({
          ...t,
          project_name: projectName(t.project_id),
          tags: tagsForTask(t.id),
          assignee: profileById(t.assignee_id),
        }));
    },
  },
  {
    method: "PUT",
    pattern: /^\/tasks\/today\/reorder$/,
    fn: (_m, body) => {
      const project_id = String(body?.project_id ?? "");
      const status = String(body?.status ?? "") as Status;
      const ids = (body?.ids ?? []) as string[];
      if (!project_id || !status) throw new DemoBadRequest("invalid reorder");
      ids.forEach((taskId, index) => {
        const task = tasks.find(
          (t) =>
            t.id === taskId &&
            t.project_id === project_id &&
            t.status === status &&
            t.is_today
        );
        if (!task) return;
        task.today_position = index;
        task.updated_at = nowIso();
      });
      return undefined;
    },
  },
  {
    method: "GET",
    pattern: /^\/tasks\/([^/]+)$/,
    fn: ([, id]) => {
      const task = tasks.find((t) => t.id === id);
      if (!task) throw new DemoNotFound("task not found");
      const subtasks = tasks
        .filter((t) => t.parent_task_id === id)
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          ...s,
          tags: tagsForTask(s.id),
          assignee: profileById(s.assignee_id),
          subtasks: [],
        }));
      return {
        ...task,
        tags: tagsForTask(task.id),
        assignee: profileById(task.assignee_id),
        subtasks,
        comments: comments
          .filter((c) => c.task_id === id)
          .sort((a, b) => a.created_at.localeCompare(b.created_at)),
        events: events
          .filter((e) => e.task_id === id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      };
    },
  },
  {
    method: "POST",
    pattern: /^\/tasks$/,
    fn: (_m, body) => {
      const project_id = body?.project_id;
      const name = String(body?.name ?? "").trim();
      if (!project_id || !name) throw new DemoBadRequest("invalid task");
      const siblings = tasks.filter((t) => t.project_id === project_id);
      const task: Task = {
        id: uid("t"),
        project_id,
        parent_task_id: body?.parent_task_id ?? null,
        assignee_id: body?.assignee_id ?? null,
        name,
        description: body?.description ?? "",
        status: body?.status ?? "todo",
        due_date: body?.due_date ?? null,
        completed_at: null,
        position:
          typeof body?.position === "number"
            ? body.position
            : (siblings.at(-1)?.position ?? -1) + 1,
        is_today: false,
        today_position: 0,
        estimated_time:
          typeof body?.estimated_time === "number" ? body.estimated_time : null,
        estimated_time_unit:
          body?.estimated_time_unit === "days" ? "days" : "hours",
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      tasks.push(task);
      logEvent(task.id, "created", null, task.name);
      if (task.parent_task_id) {
        logEvent(task.parent_task_id, "subtask_added", null, task.name);
      }
      return { ...task, tags: [], subtasks: [], comments: [], events: [], assignee: null };
    },
  },
  {
    method: "PATCH",
    pattern: /^\/tasks\/([^/]+)$/,
    fn: ([, id], body) => {
      const task = tasks.find((t) => t.id === id);
      if (!task) throw new DemoNotFound("task not found");
      const before = clone(task);

      if (typeof body?.name === "string") task.name = body.name;
      if (typeof body?.description === "string")
        task.description = body.description;
      if (typeof body?.status === "string") {
        task.status = body.status;
        task.completed_at = body.status === "done" ? nowIso() : null;
      }
      if (body?.due_date !== undefined) task.due_date = body.due_date;
      if (body?.assignee_id !== undefined) task.assignee_id = body.assignee_id;
      if (typeof body?.project_id === "string")
        task.project_id = body.project_id;
      if (body?.parent_task_id !== undefined)
        task.parent_task_id = body.parent_task_id;
      if (typeof body?.position === "number") task.position = body.position;
      if (typeof body?.is_today === "boolean" && body.is_today !== before.is_today) {
        task.is_today = body.is_today;
        if (body.is_today) {
          const peers = tasks.filter(
            (t) =>
              t.id !== task.id &&
              t.is_today &&
              t.project_id === task.project_id &&
              t.status === task.status
          );
          const max = peers.reduce(
            (m, t) => (t.today_position > m ? t.today_position : m),
            -1
          );
          task.today_position = max + 1;
        }
      }
      if (body?.estimated_time !== undefined) {
        task.estimated_time =
          typeof body.estimated_time === "number" ? body.estimated_time : null;
      }
      if (body?.estimated_time_unit === "hours" || body?.estimated_time_unit === "days") {
        task.estimated_time_unit = body.estimated_time_unit;
      }
      task.updated_at = nowIso();

      if (before.name !== task.name)
        logEvent(task.id, "renamed", before.name, task.name);
      if (before.status !== task.status)
        logEvent(task.id, "status_changed", before.status, task.status);
      if ((before.due_date ?? null) !== (task.due_date ?? null))
        logEvent(task.id, "due_date_changed", before.due_date, task.due_date);
      if ((before.description ?? "") !== (task.description ?? ""))
        logEvent(task.id, "description_changed");
      if ((before.assignee_id ?? null) !== (task.assignee_id ?? null)) {
        const fromName = profileById(before.assignee_id)?.display_name ?? null;
        const toName = profileById(task.assignee_id)?.display_name ?? null;
        if (task.assignee_id)
          logEvent(task.id, "assigned", fromName, toName);
        else logEvent(task.id, "unassigned", fromName);
      }
      if (before.is_today !== task.is_today) {
        logEvent(
          task.id,
          task.is_today ? "today_flagged" : "today_unflagged"
        );
      }
      const beforeEstimate = formatEstimate(
        before.estimated_time,
        before.estimated_time_unit
      );
      const afterEstimate = formatEstimate(
        task.estimated_time,
        task.estimated_time_unit
      );
      if (beforeEstimate !== afterEstimate) {
        logEvent(
          task.id,
          "estimated_time_changed",
          beforeEstimate,
          afterEstimate,
          { value: task.estimated_time, unit: task.estimated_time_unit }
        );
      }

      return clone(task);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/tasks\/([^/]+)$/,
    fn: ([, id]) => {
      tasks = tasks.filter((t) => t.id !== id && t.parent_task_id !== id);
      taskTags = taskTags.filter((tt) => tt.task_id !== id);
      comments = comments.filter((c) => c.task_id !== id);
      events = events.filter((e) => e.task_id !== id);
      return undefined;
    },
  },
  {
    method: "POST",
    pattern: /^\/tasks\/([^/]+)\/tags$/,
    fn: ([, taskId], body) => {
      const tagId = body?.tag_id;
      if (!tagId) throw new DemoBadRequest("tag_id required");
      if (!taskTags.some((tt) => tt.task_id === taskId && tt.tag_id === tagId)) {
        taskTags.push({ task_id: taskId, tag_id: tagId });
      }
      const tag = tags.find((t) => t.id === tagId);
      logEvent(taskId, "tag_added", null, tag?.name ?? tagId);
      return undefined;
    },
  },
  {
    method: "DELETE",
    pattern: /^\/tasks\/([^/]+)\/tags\/([^/]+)$/,
    fn: ([, taskId, tagId]) => {
      const tag = tags.find((t) => t.id === tagId);
      taskTags = taskTags.filter(
        (tt) => !(tt.task_id === taskId && tt.tag_id === tagId)
      );
      logEvent(taskId, "tag_removed", tag?.name ?? tagId);
      return undefined;
    },
  },

  // --- comments ---
  {
    method: "GET",
    pattern: /^\/tasks\/([^/]+)\/comments$/,
    fn: ([, taskId]) =>
      comments
        .filter((c) => c.task_id === taskId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
  },
  {
    method: "POST",
    pattern: /^\/tasks\/([^/]+)\/comments$/,
    fn: ([, taskId], body) => {
      const text = String(body?.body ?? "").trim();
      if (!text) throw new DemoBadRequest("body required");
      const comment: Comment = {
        id: uid("c"),
        task_id: taskId,
        body: text,
        created_at: nowIso(),
      };
      comments.push(comment);
      logEvent(taskId, "comment_added", null, text.slice(0, 140));
      return clone(comment);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/tasks\/[^/]+\/comments\/([^/]+)$/,
    fn: ([, commentId]) => {
      comments = comments.filter((c) => c.id !== commentId);
      return undefined;
    },
  },

  // --- tags ---
  {
    method: "GET",
    pattern: /^\/tags$/,
    fn: () => tags.slice().sort((a, b) => a.name.localeCompare(b.name)),
  },
  {
    method: "POST",
    pattern: /^\/tags$/,
    fn: (_m, body) => {
      const name = String(body?.name ?? "").trim();
      if (!name) throw new DemoBadRequest("name required");
      const existing = tags.find((t) => t.name === name);
      if (existing) return clone(existing);
      const tag: Tag = {
        id: uid("tag"),
        name,
        color: body?.color ?? "#64748b",
      };
      tags.push(tag);
      return clone(tag);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/tags\/([^/]+)$/,
    fn: ([, id]) => {
      tags = tags.filter((t) => t.id !== id);
      taskTags = taskTags.filter((tt) => tt.tag_id !== id);
      return undefined;
    },
  },

  // --- admin ---
  {
    method: "GET",
    pattern: /^\/admin\/allowed-emails$/,
    fn: () =>
      allowedEmails
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  },
  {
    method: "POST",
    pattern: /^\/admin\/allowed-emails$/,
    fn: (_m, body) => {
      const email = String(body?.email ?? "").trim().toLowerCase();
      if (!email) throw new DemoBadRequest("email required");
      if (allowedEmails.some((ae) => ae.email.toLowerCase() === email)) {
        throw new DemoConflict("already_allowed");
      }
      const entry: AllowedEmail = {
        id: uid("ae"),
        email,
        added_by: DEMO_ME_ID,
        created_at: nowIso(),
      };
      allowedEmails.unshift(entry);
      return clone(entry);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/admin\/allowed-emails\/([^/]+)$/,
    fn: ([, id]) => {
      allowedEmails = allowedEmails.filter((ae) => ae.id !== id);
      return undefined;
    },
  },
  {
    method: "PATCH",
    pattern: /^\/admin\/users\/([^/]+)$/,
    fn: ([, id], body) => {
      if (id === DEMO_ME_ID && body?.is_admin === false) {
        throw new DemoBadRequest("cannot_demote_self");
      }
      const user = users.find((u) => u.id === id);
      if (!user) throw new DemoNotFound("user not found");
      if (typeof body?.is_admin === "boolean") user.is_admin = body.is_admin;
      return clone(user);
    },
  },
  {
    method: "DELETE",
    pattern: /^\/admin\/users\/([^/]+)$/,
    fn: ([, id]) => {
      if (id === DEMO_ME_ID) throw new DemoBadRequest("cannot_remove_self");
      const user = users.find((u) => u.id === id);
      users = users.filter((u) => u.id !== id);
      tasks = tasks.map((t) =>
        t.assignee_id === id ? { ...t, assignee_id: null } : t
      );
      if (user?.email) {
        allowedEmails = allowedEmails.filter(
          (ae) => ae.email.toLowerCase() !== user.email!.toLowerCase()
        );
      }
      return undefined;
    },
  },
];

export async function demoFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  // Tiny delay to match async nature of fetch (also surfaces ordering bugs).
  await new Promise((r) => setTimeout(r, 30));
  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?.body ? JSON.parse(init.body as string) : null;

  for (const h of handlers) {
    if (h.method !== method) continue;
    const m = path.match(h.pattern);
    if (!m) continue;
    try {
      const result = h.fn(m, body);
      return clone(result) as T;
    } catch (e: any) {
      const status = e?.status ?? 500;
      const err = new Error(e?.message ?? "Demo error");
      (err as any).status = status;
      throw err;
    }
  }
  const err = new Error(`No demo handler for ${method} ${path}`);
  (err as any).status = 404;
  throw err;
}
