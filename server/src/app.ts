import "dotenv/config";
import express from "express";
import cors from "cors";
import { projectsRouter } from "./routes/projects.js";
import { tasksRouter } from "./routes/tasks.js";
import { commentsRouter } from "./routes/comments.js";
import { tagsRouter } from "./routes/tags.js";
import { usersRouter } from "./routes/users.js";
import { requireAuth } from "./auth.js";

export const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

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

export default app;
