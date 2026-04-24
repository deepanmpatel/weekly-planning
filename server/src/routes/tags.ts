import { Router } from "express";
import { supabase } from "../supabase.js";
import { tagCreate } from "../schemas.js";

export const tagsRouter = Router();

tagsRouter.get("/", async (_req, res) => {
  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .order("name", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

tagsRouter.post("/", async (req, res) => {
  const parsed = tagCreate.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });

  const { data: existing } = await supabase
    .from("tags")
    .select("*")
    .eq("name", parsed.data.name)
    .maybeSingle();
  if (existing) return res.status(200).json(existing);

  const { data, error } = await supabase
    .from("tags")
    .insert({
      name: parsed.data.name,
      color: parsed.data.color ?? "#64748b",
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

tagsRouter.delete("/:id", async (req, res) => {
  const { error } = await supabase.from("tags").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});
