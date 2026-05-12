// PUT /tasks/prioritized/reorder — validation + atomic writes.
//
// SEAM NOTE for backend-dev:
// Same seam as tasks.prioritized.test.ts. The route validates each id's
// server-resolved bucket and status before writing prioritized_position.
// Mismatches MUST short-circuit before any write (atomic check).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Express } from "express";
import http from "node:http";
import { createSupabaseMock, type SupabaseMockHandle } from "./supabaseMock.js";

// Stable, RFC4122-valid v4 UUIDs.
const T1 = "00000000-0000-4000-8000-000000000001";
const T2 = "00000000-0000-4000-8000-000000000002";
const T3 = "00000000-0000-4000-8000-000000000003";

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
    put: (url: string, body?: unknown) => send("PUT", url, body),
  };
}

interface SeededTask {
  id: string;
  status?: "todo" | "in_progress" | "waiting_for_reply" | "done";
  prioritized_position?: number;
  is_today?: boolean;
  tag_names?: string[]; // names attached to this task
}

const WORK_TAG_ID = "tag-work";

function seed(tasks: SeededTask[]) {
  const tagSet = new Map<string, { id: string; name: string; color: string }>();
  tagSet.set("work", { id: WORK_TAG_ID, name: "work", color: "#2563eb" });
  for (const t of tasks) {
    for (const tagName of t.tag_names ?? []) {
      const key = tagName.toLowerCase();
      if (key === "work") continue;
      if (!tagSet.has(key)) {
        tagSet.set(key, { id: `tag-${key}`, name: tagName, color: "#888888" });
      }
    }
  }

  const tagRows = Array.from(tagSet.values());

  const taskRows = tasks.map((t) => ({
    id: t.id,
    project_id: "proj-1",
    parent_task_id: null,
    assignee_id: null,
    name: `Task ${t.id}`,
    description: "",
    status: t.status ?? "todo",
    due_date: null,
    check_back_at: null,
    completed_at: null,
    position: 0,
    prioritized_position: t.prioritized_position ?? 0,
    is_today: t.is_today ?? true,
    today_position: 0,
    estimated_time: null,
    estimated_time_unit: "hours",
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
  }));

  const taskTagRows = tasks.flatMap((t) =>
    (t.tag_names ?? []).map((tagName) => {
      const tag = tagSet.get(tagName.toLowerCase())!;
      return { task_id: t.id, tag_id: tag.id, tag };
    })
  );

  mock = createSupabaseMock({
    tasks: taskRows,
    projects: [{ id: "proj-1", name: "Project Alpha", position: 0 }],
    tags: tagRows,
    task_tags: taskTagRows,
    profiles: [],
  });
}

function positionsById(): Map<string, number> {
  const m = new Map<string, number>();
  for (const row of mock.tables.tasks) {
    m.set(row.id as string, row.prioritized_position as number);
  }
  return m;
}

describe("PUT /tasks/prioritized/reorder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T12:00:00Z"));
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("happy path: writes prioritized_position = index for every id in body", async () => {
    seed([
      { id: T1, status: "todo", prioritized_position: 99, tag_names: ["work"] },
      { id: T2, status: "todo", prioritized_position: 99, tag_names: ["work"] },
      { id: T3, status: "todo", prioritized_position: 99, tag_names: ["work"] },
    ]);
    const app = await buildApp();
    const r = await request(app).put("/tasks/prioritized/reorder", {
      bucket: "work",
      status: "todo",
      ids: [T2, T3, T1],
    });
    expect(r.status).toBe(204);
    const after = positionsById();
    expect(after.get(T2)).toBe(0);
    expect(after.get(T3)).toBe(1);
    expect(after.get(T1)).toBe(2);
  });

  it("empty ids returns 204 with no writes", async () => {
    seed([
      { id: T1, status: "todo", prioritized_position: 5, tag_names: ["work"] },
    ]);
    const app = await buildApp();
    const before = positionsById();
    const r = await request(app).put("/tasks/prioritized/reorder", {
      bucket: "work",
      status: "todo",
      ids: [],
    });
    expect(r.status).toBe(204);
    const after = positionsById();
    expect(after.get(T1)).toBe(before.get(T1));
  });

  it("returns 400 when bucket value is invalid", async () => {
    seed([{ id: T1, status: "todo", tag_names: ["work"] }]);
    const app = await buildApp();
    const r = await request(app).put("/tasks/prioritized/reorder", {
      bucket: "not-a-bucket",
      status: "todo",
      ids: [T1],
    });
    expect(r.status).toBe(400);
  });

  it("returns 400 when status value is invalid", async () => {
    seed([{ id: T1, status: "todo", tag_names: ["work"] }]);
    const app = await buildApp();
    const r = await request(app).put("/tasks/prioritized/reorder", {
      bucket: "work",
      status: "garbage",
      ids: [T1],
    });
    expect(r.status).toBe(400);
  });

  it("returns 400 and writes nothing when an id's server-resolved bucket disagrees with body.bucket", async () => {
    // T1 is non_work (no tags); body claims it's in bucket=work.
    seed([
      { id: T1, status: "todo", prioritized_position: 7, tag_names: [] },
      { id: T2, status: "todo", prioritized_position: 8, tag_names: ["work"] },
    ]);
    const app = await buildApp();
    const before = positionsById();
    const r = await request(app).put("/tasks/prioritized/reorder", {
      bucket: "work",
      status: "todo",
      ids: [T2, T1], // T1 is the smuggled non_work id
    });
    expect(r.status).toBe(400);
    const after = positionsById();
    // No writes — both rows preserve their pre-call positions.
    expect(after.get(T1)).toBe(before.get(T1));
    expect(after.get(T2)).toBe(before.get(T2));
  });

  it("returns 400 and writes nothing when an id's status differs from body.status", async () => {
    seed([
      { id: T1, status: "in_progress", prioritized_position: 7, tag_names: ["work"] },
      { id: T2, status: "todo", prioritized_position: 8, tag_names: ["work"] },
    ]);
    const app = await buildApp();
    const before = positionsById();
    const r = await request(app).put("/tasks/prioritized/reorder", {
      bucket: "work",
      status: "todo",
      ids: [T2, T1], // T1 is in_progress, not todo
    });
    expect(r.status).toBe(400);
    const after = positionsById();
    expect(after.get(T1)).toBe(before.get(T1));
    expect(after.get(T2)).toBe(before.get(T2));
  });

  it("returns 400 and writes nothing when an id has is_today=false", async () => {
    seed([
      { id: T1, status: "todo", prioritized_position: 7, is_today: false, tag_names: ["work"] },
      { id: T2, status: "todo", prioritized_position: 8, is_today: true, tag_names: ["work"] },
    ]);
    const app = await buildApp();
    const before = positionsById();
    const r = await request(app).put("/tasks/prioritized/reorder", {
      bucket: "work",
      status: "todo",
      ids: [T2, T1],
    });
    expect(r.status).toBe(400);
    const after = positionsById();
    expect(after.get(T1)).toBe(before.get(T1));
    expect(after.get(T2)).toBe(before.get(T2));
  });

  it("cross-bucket attack: a non_work id smuggled into bucket=work returns 400 and writes nothing", async () => {
    // T1 has 'personal' tag (not 'work') — server-resolved bucket should be non_work.
    seed([
      {
        id: T1,
        status: "todo",
        prioritized_position: 3,
        tag_names: ["personal"],
      },
      {
        id: T2,
        status: "todo",
        prioritized_position: 4,
        tag_names: ["work"],
      },
    ]);
    const app = await buildApp();
    const before = positionsById();
    const r = await request(app).put("/tasks/prioritized/reorder", {
      bucket: "work",
      status: "todo",
      ids: [T1, T2],
    });
    expect(r.status).toBe(400);
    const after = positionsById();
    expect(after.get(T1)).toBe(before.get(T1));
    expect(after.get(T2)).toBe(before.get(T2));
  });
});
