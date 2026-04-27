import { Router } from "express";
import { z } from "zod";
import { supabase } from "../supabase.js";
import { projectCreate, projectUpdate, statusEnum } from "../schemas.js";
import { type EventInput, logEvents } from "../events.js";

export const projectsRouter = Router();

projectsRouter.get("/", async (_req, res) => {
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, position, created_at")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });

  const { data: tasks, error: tErr } = await supabase
    .from("tasks")
    .select("project_id, status, parent_task_id");
  if (tErr) return res.status(500).json({ error: tErr.message });

  const counts = new Map<string, { total: number; done: number }>();
  for (const t of tasks ?? []) {
    if (t.parent_task_id) continue;
    const c = counts.get(t.project_id) ?? { total: 0, done: 0 };
    c.total += 1;
    if (t.status === "done") c.done += 1;
    counts.set(t.project_id, c);
  }

  const withCounts = (projects ?? []).map((p) => ({
    ...p,
    task_count: counts.get(p.id)?.total ?? 0,
    done_count: counts.get(p.id)?.done ?? 0,
  }));
  res.json(withCounts);
});

projectsRouter.post("/", async (req, res) => {
  const parsed = projectCreate.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });

  const { data: maxRow } = await supabase
    .from("projects")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPos = (maxRow?.position ?? 0) + 1;

  const { data, error } = await supabase
    .from("projects")
    .insert({ name: parsed.data.name, position: nextPos })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

projectsRouter.patch("/:id", async (req, res) => {
  const parsed = projectUpdate.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });
  const { data, error } = await supabase
    .from("projects")
    .update(parsed.data)
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

projectsRouter.delete("/:id", async (req, res) => {
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});

const projectsReorderSchema = z.object({
  ordered_ids: z.array(z.string().uuid()),
});

projectsRouter.put("/order", async (req, res) => {
  const parsed = projectsReorderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const results = await Promise.all(
    parsed.data.ordered_ids.map((id, position) =>
      supabase.from("projects").update({ position }).eq("id", id)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return res.status(500).json({ error: failed.error.message });
  }
  res.status(204).end();
});

projectsRouter.get("/:id/tasks", async (req, res) => {
  const projectId = req.params.id;
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("project_id", projectId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });

  const ids = (tasks ?? []).map((t) => t.id);
  const { data: tt, error: ttErr } = ids.length
    ? await supabase
        .from("task_tags")
        .select("task_id, tag:tags(id, name, color)")
        .in("task_id", ids)
    : { data: [], error: null };
  if (ttErr) return res.status(500).json({ error: ttErr.message });

  const tagsByTask = new Map<string, any[]>();
  for (const row of (tt as any[]) ?? []) {
    const arr = tagsByTask.get(row.task_id) ?? [];
    if (row.tag) arr.push(row.tag);
    tagsByTask.set(row.task_id, arr);
  }

  const byId = new Map<string, any>();
  for (const t of tasks ?? [])
    byId.set(t.id, { ...t, tags: tagsByTask.get(t.id) ?? [], subtasks: [] });
  const roots: any[] = [];
  for (const t of byId.values()) {
    if (t.parent_task_id && byId.has(t.parent_task_id)) {
      byId.get(t.parent_task_id).subtasks.push(t);
    } else {
      roots.push(t);
    }
  }
  res.json(roots);
});

const reorderSchema = z.object({
  todo: z.array(z.string().uuid()),
  in_progress: z.array(z.string().uuid()),
  done: z.array(z.string().uuid()),
});

// Reorders all three status columns in one call. Detects cross-column moves,
// updates status (+ completed_at), and logs status_changed events.
projectsRouter.put("/:id/tasks/reorder", async (req, res) => {
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const projectId = req.params.id;
  const columns = parsed.data;

  const { data: current, error: fetchErr } = await supabase
    .from("tasks")
    .select("id, status, position")
    .eq("project_id", projectId)
    .is("parent_task_id", null);
  if (fetchErr) return res.status(500).json({ error: fetchErr.message });

  const currentById = new Map(
    (current ?? []).map((t) => [t.id, t] as const)
  );

  type Update = {
    id: string;
    patch: Record<string, unknown>;
    fromStatus: string;
    toStatus: string;
  };
  const updates: Update[] = [];

  for (const status of ["todo", "in_progress", "done"] as const) {
    columns[status].forEach((id, position) => {
      const before = currentById.get(id);
      if (!before) return;
      const statusChanged = before.status !== status;
      const positionChanged = before.position !== position;
      if (!statusChanged && !positionChanged) return;

      const patch: Record<string, unknown> = { status, position };
      if (statusChanged) {
        patch.completed_at =
          status === "done" ? new Date().toISOString() : null;
      }
      updates.push({
        id,
        patch,
        fromStatus: before.status,
        toStatus: status,
      });
    });
  }

  if (updates.length === 0) return res.status(204).end();

  const results = await Promise.all(
    updates.map((u) =>
      supabase
        .from("tasks")
        .update(u.patch)
        .eq("id", u.id)
        .eq("project_id", projectId)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return res.status(500).json({ error: failed.error.message });
  }

  const statusEvents: EventInput[] = updates
    .filter((u) => u.fromStatus !== u.toStatus)
    .map((u) => ({
      task_id: u.id,
      kind: "status_changed",
      from_value: u.fromStatus,
      to_value: u.toStatus,
    }));
  await logEvents(statusEvents);

  res.status(204).end();
});
