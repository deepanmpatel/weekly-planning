import { Router } from "express";
import { supabase } from "../supabase.js";

export const usersRouter = Router();

usersRouter.get("/", async (_req, res) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, avatar_url, is_admin")
    .order("display_name", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// /me intentionally does NOT require allowlist — a denied user must still be
// able to fetch their own status to render the "not approved" page.
usersRouter.get("/me", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "unauthenticated" });
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, avatar_url, is_admin")
    .eq("id", req.user.id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    id: req.user.id,
    email: req.user.email,
    display_name:
      data?.display_name ?? req.user.email?.split("@")[0] ?? "you",
    avatar_url: data?.avatar_url ?? null,
    is_admin: req.user.is_admin,
    is_allowed: req.user.is_allowed,
  });
});
