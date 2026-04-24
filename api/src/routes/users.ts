import { Router } from "express";
import { supabase } from "../supabase.js";

export const usersRouter = Router();

usersRouter.get("/", async (_req, res) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, avatar_url")
    .order("display_name", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

usersRouter.get("/me", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "unauthenticated" });
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, avatar_url")
    .eq("id", req.user.id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json(
    data ?? {
      id: req.user.id,
      email: req.user.email,
      display_name: req.user.email?.split("@")[0] ?? "you",
      avatar_url: null,
    }
  );
});
