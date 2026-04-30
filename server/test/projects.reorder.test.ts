// PUT /projects/:id/tasks/reorder — bulk reorder check_back_at auto-default.
//
// SEAM NOTE for backend-dev:
// Same vi.mock("../src/supabase.js") seam as tasks.patch.test.ts.
// Auto-default fires per-task when status transitions INTO waiting_for_reply
// AND the existing task's check_back_at is null.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Express } from "express";
import http from "node:http";
import { createSupabaseMock, type SupabaseMockHandle } from "./supabaseMock.js";

// Stable, readable, RFC 4122-valid v4 UUIDs for the two tasks under test.
// Last byte is monotonic so "t1" / "t2" remain visually scannable in assertions.
const T1 = "00000000-0000-4000-8000-000000000001";
const T2 = "00000000-0000-4000-8000-000000000002";

let mock: SupabaseMockHandle;

vi.mock("../src/supabase.js", () => ({
  get supabase() {
    return mock.client;
  },
}));

async function buildApp(): Promise<Express> {
  const { projectsRouter } = await import("../src/routes/projects.js");
  const app = express();
  app.use(express.json());
  app.use("/projects", projectsRouter);
  return app;
}

function request(app: Express) {
  let server: http.Server | null = null;
  function listen(): Promise<{ port: number }> {
    return new Promise((resolve) => {
      server = http.createServer(app).listen(0, () => {
        const addr = (server!.address() as { port: number });
        resolve({ port: addr.port });
      });
    });
  }
  function close(): Promise<void> {
    return new Promise((resolve) => server?.close(() => resolve()));
  }
  function send(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
    return listen().then(({ port }) =>
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
              let parsed: any = null;
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

function expectedAutoDefault(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayStr = fmt.format(new Date());
  const [y, m, d] = todayStr.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + 7);
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

interface SeededTask {
  id: string;
  status: "todo" | "in_progress" | "waiting_for_reply" | "done";
  check_back_at: string | null;
  position?: number;
}

function seed(tasks: SeededTask[]) {
  const taskRows = tasks.map((t) => ({
    id: t.id,
    project_id: "proj-1",
    parent_task_id: null,
    assignee_id: null,
    name: `Task ${t.id}`,
    description: "",
    status: t.status,
    due_date: null,
    check_back_at: t.check_back_at,
    completed_at: t.status === "done" ? "2026-04-01T00:00:00Z" : null,
    position: t.position ?? 0,
    is_today: false,
    today_position: 0,
    estimated_time: null,
    estimated_time_unit: "hours",
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
  }));
  mock = createSupabaseMock({
    tasks: taskRows,
    projects: [{ id: "proj-1", name: "Demo project" }],
  });
}

function emptyColumns() {
  return {
    todo: [] as string[],
    in_progress: [] as string[],
    waiting_for_reply: [] as string[],
    done: [] as string[],
  };
}

describe("PUT /projects/:id/tasks/reorder — check_back_at auto-default", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T12:00:00Z"));
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-defaults check_back_at to today+7d (PT) when a task moves INTO waiting_for_reply with null existing value", async () => {
    seed([{ id: T1, status: "todo", check_back_at: null }]);
    const app = await buildApp();
    const cols = emptyColumns();
    cols.waiting_for_reply = [T1];
    const r = await app && (await request(app).put("/projects/proj-1/tasks/reorder", cols));
    expect(r.status).toBe(204);
    const after = mock.tables.tasks.find((t) => t.id === T1);
    expect(after?.check_back_at).toBe(expectedAutoDefault());
  });

  it("does NOT change check_back_at when a task already in waiting_for_reply is reordered within the column", async () => {
    seed([
      { id: T1, status: "waiting_for_reply", check_back_at: "2026-05-10", position: 0 },
      { id: T2, status: "waiting_for_reply", check_back_at: null, position: 1 },
    ]);
    const app = await buildApp();
    const cols = emptyColumns();
    cols.waiting_for_reply = [T2, T1]; // swap order
    const r = await request(app).put("/projects/proj-1/tasks/reorder", cols);
    expect(r.status).toBe(204);
    const t1 = mock.tables.tasks.find((t) => t.id === T1);
    const t2 = mock.tables.tasks.find((t) => t.id === T2);
    expect(t1?.check_back_at).toBe("2026-05-10");
    expect(t2?.check_back_at).toBeNull();
  });

  it("preserves an existing non-null check_back_at when a task moves INTO waiting_for_reply with a value already set", async () => {
    seed([{ id: T1, status: "todo", check_back_at: "2026-05-20" }]);
    const app = await buildApp();
    const cols = emptyColumns();
    cols.waiting_for_reply = [T1];
    const r = await request(app).put("/projects/proj-1/tasks/reorder", cols);
    expect(r.status).toBe(204);
    const after = mock.tables.tasks.find((t) => t.id === T1);
    expect(after?.check_back_at).toBe("2026-05-20");
  });

  it("emits BOTH status_changed AND check_back_at_changed when auto-default triggers", async () => {
    seed([{ id: T1, status: "todo", check_back_at: null }]);
    const app = await buildApp();
    const cols = emptyColumns();
    cols.waiting_for_reply = [T1];
    await request(app).put("/projects/proj-1/tasks/reorder", cols);
    const kinds = mock.insertedEvents.filter((e) => e.task_id === T1).map((e) => e.kind);
    expect(kinds).toContain("status_changed");
    expect(kinds).toContain("check_back_at_changed");
  });

  it("does NOT clear check_back_at when a task moves OUT of waiting_for_reply", async () => {
    seed([{ id: T1, status: "waiting_for_reply", check_back_at: "2026-05-10" }]);
    const app = await buildApp();
    const cols = emptyColumns();
    cols.todo = [T1];
    const r = await request(app).put("/projects/proj-1/tasks/reorder", cols);
    expect(r.status).toBe(204);
    const after = mock.tables.tasks.find((t) => t.id === T1);
    expect(after?.check_back_at).toBe("2026-05-10");
  });
});
