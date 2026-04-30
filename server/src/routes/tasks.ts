import { Router } from "express";
import { z } from "zod";
import { supabase } from "../supabase.js";
import { taskCreate, taskUpdate, tagAttach, statusEnum } from "../schemas.js";
import { type EventInput, logEvent, logEvents } from "../events.js";

export const tasksRouter = Router();

// Cutoff for the lazy "evict done from Today" cleanup in GET /tasks/today.
// Returns midnight America/Los_Angeles of the date that is 2 weekdays before
// today's PT date (Sat/Sun skipped — holidays not modeled). A done task whose
// completed_at predates this cutoff has been visible for >= 2 business days
// and is evicted on the next fetch.
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
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  const hh = get("hour") === "24" ? 0 : Number(get("hour"));
  const mm = Number(get("minute"));
  const ss = Number(get("second"));
  const nowMs = Date.UTC(y, m - 1, d, hh, mm, ss);
  const ptOffsetMs = nowMs - Date.now();

  let cutoff = new Date(Date.UTC(y, m - 1, d));
  let remaining = 2;
  while (remaining > 0) {
    cutoff = new Date(cutoff.getTime() - 86_400_000);
    const dow = cutoff.getUTCDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  const cutoffMidnightAsUtc = Date.UTC(
    cutoff.getUTCFullYear(),
    cutoff.getUTCMonth(),
    cutoff.getUTCDate(),
    0,
    0,
    0
  );
  return new Date(cutoffMidnightAsUtc - ptOffsetMs).toISOString();
}

async function attachTagsMany(taskIds: string[]) {
  if (!taskIds.length) return new Map<string, any[]>();
  const { data, error } = await supabase
    .from("task_tags")
    .select("task_id, tag:tags(id, name, color)")
    .in("task_id", taskIds);
  if (error) throw error;
  const map = new Map<string, any[]>();
  for (const row of (data as any[]) ?? []) {
    const arr = map.get(row.task_id) ?? [];
    if (row.tag) arr.push(row.tag);
    map.set(row.task_id, arr);
  }
  return map;
}

function formatEstimate(
  value: number | string | null | undefined,
  unit: string | null | undefined
): string | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return null;
  return `${num}${unit === "days" ? "d" : "h"}`;
}

async function fetchAssigneeMap(assigneeIds: (string | null | undefined)[]) {
  const ids = [...new Set(assigneeIds.filter(Boolean) as string[])];
  if (!ids.length) return new Map<string, any>();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, avatar_url")
    .in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id, p] as const));
}

tasksRouter.get("/", async (_req, res) => {
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("*")
    .order("project_id", { ascending: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  const { data: projects } = await supabase.from("projects").select("id, name");
  const projName = new Map(
    (projects ?? []).map((p) => [p.id, p.name] as const)
  );
  const tagMap = await attachTagsMany((tasks ?? []).map((t) => t.id));
  const assigneeMap = await fetchAssigneeMap(
    (tasks ?? []).map((t) => t.assignee_id)
  );
  const enriched = (tasks ?? []).map((t) => ({
    ...t,
    project_name: projName.get(t.project_id) ?? null,
    tags: tagMap.get(t.id) ?? [],
    assignee: t.assignee_id ? assigneeMap.get(t.assignee_id) ?? null : null,
  }));
  res.json(enriched);
});

tasksRouter.get("/today", async (_req, res) => {
  const cutoff = staleDoneCutoffUtcIso();
  await supabase
    .from("tasks")
    .update({ is_today: false })
    .eq("is_today", true)
    .eq("status", "done")
    .lt("completed_at", cutoff);

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("is_today", true);
  if (error) return res.status(500).json({ error: error.message });

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, position");
  const projInfo = new Map(
    (projects ?? []).map((p) => [p.id, p] as const)
  );

  const tagMap = await attachTagsMany((tasks ?? []).map((t) => t.id));
  const assigneeMap = await fetchAssigneeMap(
    (tasks ?? []).map((t) => t.assignee_id)
  );

  const enriched = (tasks ?? []).map((t) => ({
    ...t,
    project_name: projInfo.get(t.project_id)?.name ?? null,
    tags: tagMap.get(t.id) ?? [],
    assignee: t.assignee_id ? assigneeMap.get(t.assignee_id) ?? null : null,
  }));

  enriched.sort((a, b) => {
    const pa = projInfo.get(a.project_id)?.position ?? 0;
    const pb = projInfo.get(b.project_id)?.position ?? 0;
    if (pa !== pb) return pa - pb;
    if (a.today_position !== b.today_position)
      return a.today_position - b.today_position;
    return (
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  });

  res.json(enriched);
});

const todayReorderSchema = z.object({
  project_id: z.string().uuid(),
  status: statusEnum,
  ids: z.array(z.string().uuid()),
});

tasksRouter.put("/today/reorder", async (req, res) => {
  const parsed = todayReorderSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });

  const { project_id, status, ids } = parsed.data;
  if (ids.length === 0) return res.status(204).end();

  const results = await Promise.all(
    ids.map((id, idx) =>
      supabase
        .from("tasks")
        .update({ today_position: idx })
        .eq("id", id)
        .eq("project_id", project_id)
        .eq("status", status)
        .eq("is_today", true)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error)
    return res.status(500).json({ error: failed.error.message });

  res.status(204).end();
});

tasksRouter.get("/:id", async (req, res) => {
  const { data: task, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", req.params.id)
    .single();
  if (error) return res.status(404).json({ error: error.message });

  const { data: subtasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("parent_task_id", task.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  const allIds = [task.id, ...(subtasks ?? []).map((s) => s.id)];
  const tagMap = await attachTagsMany(allIds);

  const assigneeMap = await fetchAssigneeMap([
    task.assignee_id,
    ...((subtasks ?? []).map((s) => s.assignee_id) ?? []),
  ]);

  const { data: comments } = await supabase
    .from("comments")
    .select("*")
    .eq("task_id", task.id)
    .order("created_at", { ascending: true });

  const { data: events } = await supabase
    .from("task_events")
    .select("*")
    .eq("task_id", task.id)
    .order("created_at", { ascending: false });

  res.json({
    ...task,
    tags: tagMap.get(task.id) ?? [],
    assignee: task.assignee_id ? assigneeMap.get(task.assignee_id) ?? null : null,
    subtasks: (subtasks ?? []).map((s) => ({
      ...s,
      tags: tagMap.get(s.id) ?? [],
      assignee: s.assignee_id ? assigneeMap.get(s.assignee_id) ?? null : null,
      subtasks: [],
    })),
    comments: comments ?? [],
    events: events ?? [],
  });
});

tasksRouter.post("/", async (req, res) => {
  const parsed = taskCreate.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });

  const { data: maxRow } = await supabase
    .from("tasks")
    .select("position")
    .eq("project_id", parsed.data.project_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPos = (maxRow?.position ?? 0) + 1;

  const insertRow: Record<string, unknown> = {
    project_id: parsed.data.project_id,
    name: parsed.data.name,
    description: parsed.data.description ?? "",
    status: parsed.data.status ?? "todo",
    due_date: parsed.data.due_date ?? null,
    parent_task_id: parsed.data.parent_task_id ?? null,
    assignee_id: parsed.data.assignee_id ?? null,
    position: parsed.data.position ?? nextPos,
    estimated_time: parsed.data.estimated_time ?? null,
    estimated_time_unit: parsed.data.estimated_time_unit ?? "hours",
  };

  const { data, error } = await supabase
    .from("tasks")
    .insert(insertRow)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  await logEvent({ task_id: data.id, kind: "created", to_value: data.name });
  if (data.parent_task_id) {
    await logEvent({
      task_id: data.parent_task_id,
      kind: "subtask_added",
      to_value: data.name,
      meta: { subtask_id: data.id },
    });
  }
  if (data.assignee_id) {
    const { data: a } = await supabase
      .from("profiles")
      .select("display_name, email")
      .eq("id", data.assignee_id)
      .maybeSingle();
    await logEvent({
      task_id: data.id,
      kind: "assigned",
      to_value: a?.display_name ?? a?.email ?? data.assignee_id,
    });
  }

  res.status(201).json({
    ...data,
    tags: [],
    subtasks: [],
    comments: [],
    events: [],
    assignee: null,
  });
});

tasksRouter.patch("/:id", async (req, res) => {
  const parsed = taskUpdate.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });

  const { data: before, error: beforeErr } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", req.params.id)
    .single();
  if (beforeErr) return res.status(404).json({ error: beforeErr.message });

  const patch: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "done") patch.completed_at = new Date().toISOString();
  if (parsed.data.status && parsed.data.status !== "done")
    patch.completed_at = null;

  if (parsed.data.is_today === true && before.is_today === false) {
    const destProjectId = parsed.data.project_id ?? before.project_id;
    const destStatus = parsed.data.status ?? before.status;
    const { data: maxRow } = await supabase
      .from("tasks")
      .select("today_position")
      .eq("is_today", true)
      .eq("project_id", destProjectId)
      .eq("status", destStatus)
      .order("today_position", { ascending: false })
      .limit(1)
      .maybeSingle();
    patch.today_position = (maxRow?.today_position ?? -1) + 1;
  }

  const { data: after, error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  const events: EventInput[] = [];
  if (before.name !== after.name) {
    events.push({
      task_id: after.id,
      kind: "renamed",
      from_value: before.name,
      to_value: after.name,
    });
  }
  if (before.status !== after.status) {
    events.push({
      task_id: after.id,
      kind: "status_changed",
      from_value: before.status,
      to_value: after.status,
    });
  }
  if ((before.due_date ?? null) !== (after.due_date ?? null)) {
    events.push({
      task_id: after.id,
      kind: "due_date_changed",
      from_value: before.due_date,
      to_value: after.due_date,
    });
  }
  if ((before.description ?? "") !== (after.description ?? "")) {
    events.push({ task_id: after.id, kind: "description_changed" });
  }
  if (before.project_id !== after.project_id) {
    const { data: projs } = await supabase
      .from("projects")
      .select("id, name")
      .in("id", [before.project_id, after.project_id]);
    const byId = new Map((projs ?? []).map((p) => [p.id, p.name] as const));
    events.push({
      task_id: after.id,
      kind: "moved_project",
      from_value: byId.get(before.project_id) ?? null,
      to_value: byId.get(after.project_id) ?? null,
    });
  }
  if ((before.parent_task_id ?? null) !== (after.parent_task_id ?? null)) {
    events.push({
      task_id: after.id,
      kind: "reparented",
      from_value: before.parent_task_id,
      to_value: after.parent_task_id,
    });
  }
  if ((before.assignee_id ?? null) !== (after.assignee_id ?? null)) {
    const ids = [before.assignee_id, after.assignee_id].filter(Boolean) as string[];
    const profMap = await fetchAssigneeMap(ids);
    const label = (id: string | null) =>
      id ? profMap.get(id)?.display_name ?? profMap.get(id)?.email ?? id : null;
    if (after.assignee_id) {
      events.push({
        task_id: after.id,
        kind: "assigned",
        from_value: label(before.assignee_id),
        to_value: label(after.assignee_id),
      });
    } else {
      events.push({
        task_id: after.id,
        kind: "unassigned",
        from_value: label(before.assignee_id),
      });
    }
  }
  if (before.is_today !== after.is_today) {
    events.push({
      task_id: after.id,
      kind: after.is_today ? "today_flagged" : "today_unflagged",
    });
  }
  const beforeEstimate = formatEstimate(
    before.estimated_time,
    before.estimated_time_unit
  );
  const afterEstimate = formatEstimate(
    after.estimated_time,
    after.estimated_time_unit
  );
  if (beforeEstimate !== afterEstimate) {
    events.push({
      task_id: after.id,
      kind: "estimated_time_changed",
      from_value: beforeEstimate,
      to_value: afterEstimate,
      meta: {
        value: after.estimated_time,
        unit: after.estimated_time_unit,
      },
    });
  }
  await logEvents(events);

  res.json(after);
});

tasksRouter.delete("/:id", async (req, res) => {
  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});

tasksRouter.post("/:id/tags", async (req, res) => {
  const parsed = tagAttach.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });
  const { error } = await supabase
    .from("task_tags")
    .insert({ task_id: req.params.id, tag_id: parsed.data.tag_id });
  if (error) return res.status(500).json({ error: error.message });

  const { data: tag } = await supabase
    .from("tags")
    .select("name")
    .eq("id", parsed.data.tag_id)
    .maybeSingle();
  await logEvent({
    task_id: req.params.id,
    kind: "tag_added",
    to_value: tag?.name ?? parsed.data.tag_id,
  });
  res.status(204).end();
});

tasksRouter.delete("/:id/tags/:tagId", async (req, res) => {
  const { data: tag } = await supabase
    .from("tags")
    .select("name")
    .eq("id", req.params.tagId)
    .maybeSingle();

  const { error } = await supabase
    .from("task_tags")
    .delete()
    .eq("task_id", req.params.id)
    .eq("tag_id", req.params.tagId);
  if (error) return res.status(500).json({ error: error.message });

  await logEvent({
    task_id: req.params.id,
    kind: "tag_removed",
    from_value: tag?.name ?? req.params.tagId,
  });
  res.status(204).end();
});
