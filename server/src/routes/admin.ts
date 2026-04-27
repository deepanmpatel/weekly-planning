import { Router } from "express";
import { z } from "zod";
import { supabase } from "../supabase.js";
import { requireAdmin } from "../auth.js";

export const adminRouter = Router();

adminRouter.use(requireAdmin);

adminRouter.get("/allowed-emails", async (_req, res) => {
  const { data, error } = await supabase
    .from("allowed_emails")
    .select("id, email, added_by, created_at")
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

const addEmailSchema = z.object({
  email: z.string().email().max(320),
});

adminRouter.post("/allowed-emails", async (req, res) => {
  const parsed = addEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const email = parsed.data.email.trim().toLowerCase();

  const { data, error } = await supabase
    .from("allowed_emails")
    .insert({ email, added_by: req.user!.id })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "already_allowed" });
    }
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json(data);
});

adminRouter.delete("/allowed-emails/:id", async (req, res) => {
  const { error } = await supabase
    .from("allowed_emails")
    .delete()
    .eq("id", req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});

const setAdminSchema = z.object({
  is_admin: z.boolean(),
});

adminRouter.patch("/users/:id", async (req, res) => {
  const parsed = setAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  if (req.params.id === req.user!.id && parsed.data.is_admin === false) {
    return res
      .status(400)
      .json({ error: "cannot_demote_self" });
  }
  const { data, error } = await supabase
    .from("profiles")
    .update({ is_admin: parsed.data.is_admin })
    .eq("id", req.params.id)
    .select("id, email, display_name, avatar_url, is_admin")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Hard-delete a signed-in user. Cascades:
//   auth.users → profiles (FK on delete cascade)
//   auth.users → tasks.assignee_id (set null)
//   auth.users → allowed_emails.added_by (set null)
// Also removes their email from allowed_emails so they can't re-sign-in without re-approval.
adminRouter.delete("/users/:id", async (req, res) => {
  const targetId = req.params.id;
  if (targetId === req.user!.id) {
    return res.status(400).json({ error: "cannot_remove_self" });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", targetId)
    .maybeSingle();

  const { error: deleteErr } = await supabase.auth.admin.deleteUser(targetId);
  if (deleteErr) {
    return res.status(500).json({ error: deleteErr.message });
  }

  if (profile?.email) {
    await supabase
      .from("allowed_emails")
      .delete()
      .ilike("email", profile.email);
  }

  res.status(204).end();
});
