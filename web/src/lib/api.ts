import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  AllowedEmail,
  Comment,
  Profile,
  Project,
  Tag,
  Task,
} from "./types";
import { getAccessToken } from "./auth";
import { DEMO_MODE } from "./demoMode";
import { demoFetch } from "./demo/demoStore";

// Dev (.env has explicit URL) → http://localhost:3001 + /projects, etc.
// Prod (Vercel, no env var) → "/api" + /projects → Vercel rewrite → Express function.
const BASE = import.meta.env.VITE_API_BASE || "/api";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  if (DEMO_MODE) return demoFetch<T>(path, init);

  const token = await getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      msg = body?.error?.formErrors?.join(", ") || body?.error || msg;
    } catch {
      /* noop */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const qk = {
  projects: ["projects"] as const,
  projectTasks: (id: string) => ["projects", id, "tasks"] as const,
  allTasks: ["tasks"] as const,
  todayTasks: ["tasks", "today"] as const,
  task: (id: string) => ["tasks", id] as const,
  tags: ["tags"] as const,
  users: ["users"] as const,
  me: ["me"] as const,
  allowedEmails: ["admin", "allowed-emails"] as const,
};

/* ---------- Projects ---------- */

export function useProjects() {
  return useQuery({
    queryKey: qk.projects,
    queryFn: () => http<Project[]>("/projects"),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      http<Project>("/projects", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projects }),
  });
}

export function useRenameProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      http<Project>(`/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projects }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      http<void>(`/projects/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.projects });
      qc.invalidateQueries({ queryKey: qk.allTasks });
    },
  });
}

export function useReorderProjects() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ordered_ids: string[]) =>
      http<void>("/projects/order", {
        method: "PUT",
        body: JSON.stringify({ ordered_ids }),
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.projects }),
  });
}

export function useProjectTasks(id: string | undefined) {
  return useQuery({
    queryKey: id ? qk.projectTasks(id) : ["projects", "none", "tasks"],
    queryFn: () => http<Task[]>(`/projects/${id}/tasks`),
    enabled: !!id,
  });
}

export interface ReorderColumns {
  todo: string[];
  in_progress: string[];
  waiting_for_reply: string[];
  done: string[];
}

export function useReorderProjectTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      columns,
    }: {
      projectId: string;
      columns: ReorderColumns;
    }) =>
      http<void>(`/projects/${projectId}/tasks/reorder`, {
        method: "PUT",
        body: JSON.stringify(columns),
      }),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: qk.projectTasks(vars.projectId) });
      qc.invalidateQueries({ queryKey: qk.allTasks });
      qc.invalidateQueries({ queryKey: qk.projects });
    },
  });
}

/* ---------- Tasks ---------- */

export function useAllTasks() {
  return useQuery({
    queryKey: qk.allTasks,
    queryFn: () => http<Task[]>("/tasks"),
  });
}

export function useTodayTasks() {
  return useQuery({
    queryKey: qk.todayTasks,
    queryFn: () => http<Task[]>("/tasks/today"),
    staleTime: 0,
  });
}

export function useReorderTodayCell() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      project_id,
      status,
      ids,
    }: {
      project_id: string;
      status: Task["status"];
      ids: string[];
    }) =>
      http<void>("/tasks/today/reorder", {
        method: "PUT",
        body: JSON.stringify({ project_id, status, ids }),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.todayTasks });
      qc.invalidateQueries({ queryKey: qk.allTasks });
    },
  });
}

export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: id ? qk.task(id) : ["tasks", "none"],
    queryFn: () => http<Task>(`/tasks/${id}`),
    enabled: !!id,
  });
}

export interface CreateTaskInput {
  project_id: string;
  parent_task_id?: string | null;
  name: string;
  description?: string;
  status?: Task["status"];
  due_date?: string | null;
  check_back_at?: string | null;
  assignee_id?: string | null;
  estimated_time?: number | null;
  estimated_time_unit?: Task["estimated_time_unit"];
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      http<Task>("/tasks", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.projectTasks(vars.project_id) });
      qc.invalidateQueries({ queryKey: qk.allTasks });
      qc.invalidateQueries({ queryKey: qk.projects });
      if (vars.parent_task_id)
        qc.invalidateQueries({ queryKey: qk.task(vars.parent_task_id) });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Task> }) =>
      http<Task>(`/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.projectTasks(data.project_id) });
      qc.invalidateQueries({ queryKey: qk.allTasks });
      qc.invalidateQueries({ queryKey: qk.todayTasks });
      qc.invalidateQueries({ queryKey: qk.task(data.id) });
      qc.invalidateQueries({ queryKey: qk.projects });
      if (data.parent_task_id)
        qc.invalidateQueries({ queryKey: qk.task(data.parent_task_id) });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      http<void>(`/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.allTasks });
      qc.invalidateQueries({ queryKey: qk.projects });
      // Over-invalidate; simpler than tracking.
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

/* ---------- Comments ---------- */

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, body }: { taskId: string; body: string }) =>
      http<Comment>(`/tasks/${taskId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    onSuccess: (_c, vars) =>
      qc.invalidateQueries({ queryKey: qk.task(vars.taskId) }),
  });
}

/* ---------- Tags ---------- */

export function useTags() {
  return useQuery({
    queryKey: qk.tags,
    queryFn: () => http<Tag[]>("/tags"),
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; color?: string }) =>
      http<Tag>("/tags", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tags }),
  });
}

export function useAttachTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, tagId }: { taskId: string; tagId: string }) =>
      http<void>(`/tasks/${taskId}/tags`, {
        method: "POST",
        body: JSON.stringify({ tag_id: tagId }),
      }),
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: qk.task(vars.taskId) });
      qc.invalidateQueries({ queryKey: qk.allTasks });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useDetachTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, tagId }: { taskId: string; tagId: string }) =>
      http<void>(`/tasks/${taskId}/tags/${tagId}`, { method: "DELETE" }),
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: qk.task(vars.taskId) });
      qc.invalidateQueries({ queryKey: qk.allTasks });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

/* ---------- Users ---------- */

export function useUsers() {
  return useQuery({
    queryKey: qk.users,
    queryFn: () => http<Profile[]>("/users"),
    staleTime: 60_000,
  });
}

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: () => http<Profile>("/users/me"),
    staleTime: 60_000,
  });
}

/* ---------- Admin ---------- */

export function useAllowedEmails() {
  return useQuery({
    queryKey: qk.allowedEmails,
    queryFn: () => http<AllowedEmail[]>("/admin/allowed-emails"),
  });
}

export function useAddAllowedEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) =>
      http<AllowedEmail>("/admin/allowed-emails", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: qk.allowedEmails }),
  });
}

export function useRemoveAllowedEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      http<void>(`/admin/allowed-emails/${id}`, { method: "DELETE" }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: qk.allowedEmails }),
  });
}

export function useSetUserAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, is_admin }: { id: string; is_admin: boolean }) =>
      http<Profile>(`/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_admin }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.users });
      qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

export function useRemoveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      http<void>(`/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.users });
      qc.invalidateQueries({ queryKey: qk.allowedEmails });
      qc.invalidateQueries({ queryKey: qk.allTasks });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
