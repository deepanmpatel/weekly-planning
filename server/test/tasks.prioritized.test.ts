// GET /tasks/prioritized — bucket derivation, filtering, sort.
//
// SEAM NOTE for backend-dev:
// Mirrors the seam used by tasks.patch.test.ts. Imports the `tasksRouter` and
// stubs the `supabase` module via vi.mock. The Supabase mock supports the
// chains used by the route: `.from().select(...).is(...)`,
// `.from().select(...).in(...)` (used by attachTagsMany + fetchAssigneeMap),
// `.from().select("id, name")` (project name lookup).
//
// Bucket = "work" iff any tag on the task has name.toLowerCase() === "work".
// `task_tags` join shape returned by attachTagsMany is `[{ name, color }]`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Express } from "express";
import http from "node:http";
import { createSupabaseMock, type SupabaseMockHandle } from "./supabaseMock.js";

let mock: SupabaseMockHandle;

vi.mock("../src/supabase.js", () => ({
  get supabase() {
    return mock.client;
  },
}));

async function buildApp(): Promise<Express> {
  const { tasksRouter } = await import("../src/routes/tasks.js");
  const app = express();
  app.use(express.json());
  app.use("/tasks", tasksRouter);
  return app;
}

function request(app: Express) {
  let server: http.Server | null = null;
  function listen(): Promise<{ port: number }> {
    return new Promise((resolve) => {
      server = http.createServer(app).listen(0, () => {
        const addr = server!.address() as { port: number };
        resolve({ port: addr.port });
      });
    });
  }
  function close(): Promise<void> {
    return new Promise((resolve) => server?.close(() => resolve()));
  }
  function send(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ status: number; body: unknown }> {
    return listen().then(
      ({ port }) =>
        new Promise((resolve, reject) => {
          const data = body !== undefined ? JSON.stringify(body) : undefined;
          const req = http.request(
            {
              method,
              host: "127.0.0.1",
              port,
              path,
              headers: {
                "Content-Type": "application/json",
                ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
              },
            },
            (res) => {
              const chunks: Buffer[] = [];
              res.on("data", (c) => chunks.push(c));
              res.on("end", async () => {
                await close();
                const text = Buffer.concat(chunks).toString("utf8");
                let parsed: unknown = null;
                try {
                  parsed = text ? JSON.parse(text) : null;
                } catch {
                  parsed = text;
                }
                resolve({ status: res.statusCode ?? 0, body: parsed });
              });
            }
          );
          req.on("error", reject);
          if (data) req.write(data);
          req.end();
        })
    );
  }
  return {
    get: (url: string) => send("GET", url),
  };
}

interface SeededTask {
  id: string;
  project_id?: string;
  parent_task_id?: string | null;
  status?: "todo" | "in_progress" | "waiting_for_reply" | "done";
  prioritized_position?: number;
  completed_at?: string | null;
  created_at?: string;
  is_today?: boolean;
  tag_names?: string[]; // attached tag names
}

interface SeedOptions {
  tasks?: SeededTask[];
}

const WORK_TAG_ID = "tag-work";

function seed({ tasks = [] }: SeedOptions) {
  // Build canonical tag rows. Make sure a canonical "work" tag exists.
  const tagSet = new Map<string, { id: string; name: string; color: string }>();
  tagSet.set("work", { id: WORK_TAG_ID, name: "work", color: "#2563eb" });
  for (const t of tasks) {
    for (const tagName of t.tag_names ?? []) {
      const key = tagName.toLowerCase();
      if (key === "work") continue; // already canonical (id == WORK_TAG_ID)
      if (!tagSet.has(key)) {
        tagSet.set(key, {
          id: `tag-${key}`,
          name: tagName,
          color: "#888888",
        });
      }
    }
    // If the test wrote a "Work"/"WORK" variant, keep that variant's casing
    // visible by overriding the canonical row's name. Bucket logic is
    // case-insensitive, so this affects only the data the route reads back.
    for (const tagName of t.tag_names ?? []) {
      if (tagName.toLowerCase() === "work" && tagName !== "work") {
        tagSet.set("work", { id: WORK_TAG_ID, name: tagName, color: "#2563eb" });
      }
    }
  }

  const tagRows = Array.from(tagSet.values());

  // tasks rows
  const taskRows = tasks.map((t) => ({
    id: t.id,
    project_id: t.project_id ?? "proj-1",
    parent_task_id: t.parent_task_id ?? null,
    assignee_id: null,
    name: `Task ${t.id}`,
    description: "",
    status: t.status ?? "todo",
    due_date: null,
    check_back_at: null,
    completed_at: t.completed_at ?? null,
    position: 0,
    prioritized_position: t.prioritized_position ?? 0,
    is_today: t.is_today ?? true,
    today_position: 0,
    estimated_time: null,
    estimated_time_unit: "hours",
    created_at: t.created_at ?? "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
  }));

  // task_tags rows — emit shape that the route's attachTagsMany expects.
  // The route does `.select("task_id, tag:tags(id, name, color)")`. Our mock
  // doesn't understand the embed syntax; instead, we pre-bake the embedded
  // `tag` object so the route sees `row.tag` directly when it iterates.
  const taskTagRows = tasks.flatMap((t) =>
    (t.tag_names ?? []).map((tagName) => {
      const tag = tagSet.get(tagName.toLowerCase())!;
      return { task_id: t.id, tag_id: tag.id, tag };
    })
  );

  mock = createSupabaseMock({
    tasks: taskRows,
    projects: [
      { id: "proj-1", name: "Project Alpha", position: 0 },
      { id: "proj-2", name: "Project Beta", position: 1 },
    ],
    tags: tagRows,
    task_tags: taskTagRows,
    profiles: [],
  });
}

interface PrioritizedTaskRow {
  id: string;
  status: string;
  bucket: "work" | "non_work";
  project_name: string | null;
  tags: Array<{ id: string; name: string; color: string }>;
  prioritized_position: number;
  completed_at: string | null;
  parent_task_id: string | null;
}

describe("GET /tasks/prioritized", () => {
  beforeEach(() => {
    // Pin the clock — staleDoneCutoffUtcIso() uses Date.now()
    // 2026-04-30 12:00 UTC = 2026-04-30 05:00 PT
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T12:00:00Z"));
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 200 with an empty array when there are no non-subtask tasks", async () => {
    seed({ tasks: [] });
    const app = await buildApp();
    const r = await request(app).get("/tasks/prioritized");
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  it("tags a task with name 'work' as bucket='work' and an untagged task as 'non_work'", async () => {
    seed({
      tasks: [
        { id: "t-work", tag_names: ["work"] },
        { id: "t-untagged", tag_names: [] },
      ],
    });
    const app = await buildApp();
    const r = await request(app).get("/tasks/prioritized");
    expect(r.status).toBe(200);
    const rows = r.body as PrioritizedTaskRow[];
    const work = rows.find((row) => row.id === "t-work");
    const untagged = rows.find((row) => row.id === "t-untagged");
    expect(work?.bucket).toBe("work");
    expect(untagged?.bucket).toBe("non_work");
  });

  it("treats 'Work' and 'WORK' as work-tagged (case-insensitive match)", async () => {
    // Two tasks tagged with different casings; one task with a different tag entirely.
    seed({
      tasks: [
        { id: "t-Work", tag_names: ["Work"] },
        { id: "t-WORK", tag_names: ["WORK"] },
        { id: "t-other", tag_names: ["personal"] },
      ],
    });
    const app = await buildApp();
    const r = await request(app).get("/tasks/prioritized");
    expect(r.status).toBe(200);
    const rows = r.body as PrioritizedTaskRow[];
    expect(rows.find((row) => row.id === "t-Work")?.bucket).toBe("work");
    expect(rows.find((row) => row.id === "t-WORK")?.bucket).toBe("work");
    expect(rows.find((row) => row.id === "t-other")?.bucket).toBe("non_work");
  });

  it("orders tasks within a bucket by status (todo->in_progress->waiting_for_reply->done), then prioritized_position, then created_at", async () => {
    // All in the same bucket (non_work), mixed statuses and positions.
    seed({
      tasks: [
        {
          id: "t-done",
          status: "done",
          prioritized_position: 0,
          completed_at: "2026-04-30T11:00:00Z",
          created_at: "2026-04-01T00:00:00Z",
        },
        {
          id: "t-wfr",
          status: "waiting_for_reply",
          prioritized_position: 9,
          created_at: "2026-04-01T00:00:00Z",
        },
        {
          id: "t-inprog",
          status: "in_progress",
          prioritized_position: 5,
          created_at: "2026-04-01T00:00:00Z",
        },
        {
          id: "t-todo-b",
          status: "todo",
          prioritized_position: 2,
          created_at: "2026-04-02T00:00:00Z",
        },
        {
          id: "t-todo-a",
          status: "todo",
          prioritized_position: 2,
          created_at: "2026-04-01T00:00:00Z",
        },
        {
          id: "t-todo-c",
          status: "todo",
          prioritized_position: 1,
          created_at: "2026-04-10T00:00:00Z",
        },
      ],
    });
    const app = await buildApp();
    const r = await request(app).get("/tasks/prioritized");
    expect(r.status).toBe(200);
    const ids = (r.body as PrioritizedTaskRow[]).map((row) => row.id);
    // todo first (sorted by prioritized_position asc; ties broken by created_at asc)
    // then in_progress, then waiting_for_reply, then done.
    expect(ids).toEqual([
      "t-todo-c", // prio 1
      "t-todo-a", // prio 2, earlier created
      "t-todo-b", // prio 2, later created
      "t-inprog",
      "t-wfr",
      "t-done",
    ]);
  });

  it("sorts Done within a bucket by completed_at desc, regardless of prioritized_position", async () => {
    seed({
      tasks: [
        {
          id: "t-d1",
          status: "done",
          prioritized_position: 0,
          completed_at: "2026-04-30T05:00:00Z",
        },
        {
          id: "t-d2",
          status: "done",
          prioritized_position: 9,
          completed_at: "2026-04-30T11:00:00Z",
        },
        {
          id: "t-d3",
          status: "done",
          prioritized_position: 1,
          completed_at: "2026-04-30T09:00:00Z",
        },
      ],
    });
    const app = await buildApp();
    const r = await request(app).get("/tasks/prioritized");
    const ids = (r.body as PrioritizedTaskRow[]).map((row) => row.id);
    expect(ids).toEqual(["t-d2", "t-d3", "t-d1"]); // latest completed first
  });

  it("excludes Done tasks whose completed_at is older than the 2-business-day cutoff", async () => {
    // System clock: 2026-04-30 (Thursday). 2 business days back = 2026-04-28 (Tue PT midnight)
    // Anything completed BEFORE 2026-04-28 PT midnight (~2026-04-28T07:00Z) is stale.
    seed({
      tasks: [
        {
          id: "t-fresh-done",
          status: "done",
          completed_at: "2026-04-30T05:00:00Z", // today
        },
        {
          id: "t-stale-done",
          status: "done",
          completed_at: "2026-04-20T05:00:00Z", // 10 days ago, well past cutoff
        },
      ],
    });
    const app = await buildApp();
    const r = await request(app).get("/tasks/prioritized");
    const ids = (r.body as PrioritizedTaskRow[]).map((row) => row.id);
    expect(ids).toContain("t-fresh-done");
    expect(ids).not.toContain("t-stale-done");
  });

  it("excludes subtasks (parent_task_id IS NOT NULL)", async () => {
    seed({
      tasks: [
        { id: "t-parent", parent_task_id: null },
        { id: "t-child", parent_task_id: "t-parent" },
      ],
    });
    const app = await buildApp();
    const r = await request(app).get("/tasks/prioritized");
    const ids = (r.body as PrioritizedTaskRow[]).map((row) => row.id);
    expect(ids).toContain("t-parent");
    expect(ids).not.toContain("t-child");
  });

  it("excludes tasks whose is_today flag is false", async () => {
    seed({
      tasks: [
        { id: "t-on", is_today: true },
        { id: "t-off", is_today: false },
      ],
    });
    const app = await buildApp();
    const r = await request(app).get("/tasks/prioritized");
    const ids = (r.body as PrioritizedTaskRow[]).map((row) => row.id);
    expect(ids).toContain("t-on");
    expect(ids).not.toContain("t-off");
  });

  it("lazy-cleanup: a stale done is_today task has its is_today flag cleared and is excluded", async () => {
    seed({
      tasks: [
        {
          id: "t-stale",
          status: "done",
          is_today: true,
          completed_at: "2026-04-20T05:00:00Z",
        },
      ],
    });
    const app = await buildApp();
    const r = await request(app).get("/tasks/prioritized");
    expect((r.body as PrioritizedTaskRow[]).map((row) => row.id)).toEqual([]);
    const stale = mock.tables.tasks.find((row) => row.id === "t-stale");
    expect(stale?.is_today).toBe(false);
  });
});
