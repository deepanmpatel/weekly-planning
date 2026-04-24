import "dotenv/config";
import express from "express";
import cors from "cors";
import { projectsRouter } from "./routes/projects.js";
import { tasksRouter } from "./routes/tasks.js";
import { commentsRouter } from "./routes/comments.js";
import { tagsRouter } from "./routes/tags.js";
import { usersRouter } from "./routes/users.js";
import { requireAuth } from "./auth.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Everything below requires a valid Supabase JWT (Bearer token).
app.use(requireAuth);

app.use("/projects", projectsRouter);
app.use("/tasks", tasksRouter);
app.use("/tasks/:taskId/comments", commentsRouter);
app.use("/tags", tagsRouter);
app.use("/users", usersRouter);

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ error: err?.message ?? "Internal error" });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
