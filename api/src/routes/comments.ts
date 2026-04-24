import { Router } from "express";
import { supabase } from "../supabase.js";
import { commentCreate } from "../schemas.js";
import { logEvent } from "../events.js";

export const commentsRouter = Router({ mergeParams: true });

commentsRouter.get("/", async (req, res) => {
  const taskId = (req.params as { taskId: string }).taskId;
  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

commentsRouter.post("/", async (req, res) => {
  const taskId = (req.params as { taskId: string }).taskId;
  const parsed = commentCreate.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });
  const { data, error } = await supabase
    .from("comments")
    .insert({ task_id: taskId, body: parsed.data.body })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  await logEvent({
    task_id: taskId,
    kind: "comment_added",
    to_value: parsed.data.body.slice(0, 140),
  });
  res.status(201).json(data);
});

commentsRouter.delete("/:commentId", async (req, res) => {
  const { commentId } = req.params as { commentId: string };
  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});
