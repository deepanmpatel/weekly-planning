import "dotenv/config";
import express from "express";
import cors from "cors";
import { projectsRouter } from "./routes/projects.js";
import { tasksRouter } from "./routes/tasks.js";
import { commentsRouter } from "./routes/comments.js";
import { tagsRouter } from "./routes/tags.js";
import { usersRouter } from "./routes/users.js";
import { adminRouter } from "./routes/admin.js";
import { requireAllowed, requireAuth } from "./auth.js";

export const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Everything below requires a valid Supabase JWT.
app.use(requireAuth);

// /users/me must work for denied users (so frontend can render the
// "not approved" page) → no requireAllowed here.
app.use("/users", usersRouter);

// Admin routes are scoped to /admin and gated by requireAdmin inside.
app.use("/admin", adminRouter);

// Data routes require the email to be on the allowlist.
app.use(requireAllowed);
app.use("/projects", projectsRouter);
app.use("/tasks", tasksRouter);
app.use("/tasks/:taskId/comments", commentsRouter);
app.use("/tags", tagsRouter);

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ error: err?.message ?? "Internal error" });
});

export default app;
