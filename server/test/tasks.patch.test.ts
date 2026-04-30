// PATCH /tasks/:id — `check_back_at` business logic.
//
// SEAM NOTE for backend-dev:
// These tests import the `tasksRouter` and a `supabase` mock. To run cleanly,
// the implementation needs the existing `supabase` module to remain mockable
// via `vi.mock("../src/supabase.js")` (it already is, since the routes import
// `import { supabase } from "../supabase.js"`). No refactor required as long
// as that import shape is preserved.
//
// Tests assume the auto-default for check_back_at is computed in the
// America/Los_Angeles timezone, formatted as YYYY-MM-DD, equal to today + 7d.
// Clock is frozen with vi.useFakeTimers so "today" is deterministic.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Express } from "express";
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

// We use supertest-lite via Node's http module to avoid extra deps.
// Backend-dev: replace with `supertest` if you'd rather; the surface
// these tests rely on is just `request(app).patch(url).send(body)`.
import http from "node:http";

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
    patch: (url: string, body?: unknown) => send("PATCH", url, body),
    post: (url: string, body?: unknown) => send("POST", url, body),
    put: (url: string, body?: unknown) => send("PUT", url, body),
  };
}

// Helper to compute "today + 7 days" in the America/Los_Angeles timezone
// in YYYY-MM-DD format, using the same algorithm the implementation should use.
function expectedAutoDefault(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayStr = fmt.format(new Date()); // YYYY-MM-DD in PT
  const [y, m, d] = todayStr.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + 7);
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

describe("PATCH /tasks/:id — check_back_at", () => {
  beforeEach(() => {
    // Freeze the clock to a known instant inside Pacific time
    // (2026-04-30 12:00 UTC = 2026-04-30 05:00 PT — well within "today" PT)
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T12:00:00Z"));
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function seed(overrides: Record<string, unknown> = {}) {
    const baseTask: Record<string, unknown> = {
      id: "task-1",
      project_id: "proj-1",
      parent_task_id: null,
      assignee_id: null,
      name: "Sample task",
      description: "",
      status: "todo",
      due_date: null,
      check_back_at: null,
      completed_at: null,
      position: 0,
      is_today: false,
      today_position: 0,
      estimated_time: null,
      estimated_time_unit: "hours",
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
      ...overrides,
    };
    mock = createSupabaseMock({
      tasks: [baseTask],
      projects: [{ id: "proj-1", name: "Demo project" }],
      profiles: [],
    });
  }

  it("auto-defaults check_back_at to today+7d (PT) when status transitions to waiting_for_reply with no body field and existing null", async () => {
    seed({ status: "todo", check_back_at: null });
    const app = await buildApp();
    const r = await request(app).patch("/tasks/task-1", { status: "waiting_for_reply" });
    expect(r.status).toBe(200);
    expect(r.body.check_back_at).toBe(expectedAutoDefault());
  });

  it("does NOT clobber an explicit check_back_at in the body when transitioning to waiting_for_reply", async () => {
    seed({ status: "todo", check_back_at: null });
    const app = await buildApp();
    const r = await request(app).patch("/tasks/task-1", {
      status: "waiting_for_reply",
      check_back_at: "2026-06-01",
    });
    expect(r.status).toBe(200);
    expect(r.body.check_back_at).toBe("2026-06-01");
  });

  it("preserves an existing non-null check_back_at when transitioning to waiting_for_reply", async () => {
    seed({ status: "todo", check_back_at: "2026-05-15" });
    const app = await buildApp();
    const r = await request(app).patch("/tasks/task-1", { status: "waiting_for_reply" });
    expect(r.status).toBe(200);
    expect(r.body.check_back_at).toBe("2026-05-15");
  });

  it("preserves check_back_at when status moves out of waiting_for_reply (does NOT auto-clear)", async () => {
    seed({ status: "waiting_for_reply", check_back_at: "2026-05-15" });
    const app = await buildApp();
    const r = await request(app).patch("/tasks/task-1", { status: "todo" });
    expect(r.status).toBe(200);
    expect(r.body.check_back_at).toBe("2026-05-15");
  });

  it("clears check_back_at when body sends explicit null", async () => {
    seed({ status: "waiting_for_reply", check_back_at: "2026-05-15" });
    const app = await buildApp();
    const r = await request(app).patch("/tasks/task-1", { check_back_at: null });
    expect(r.status).toBe(200);
    expect(r.body.check_back_at).toBeNull();
  });

  it("emits check_back_at_changed event on auto-default flip from null to today+7", async () => {
    seed({ status: "todo", check_back_at: null });
    const app = await buildApp();
    await request(app).patch("/tasks/task-1", { status: "waiting_for_reply" });
    const e = mock.insertedEvents.find((ev) => ev.kind === "check_back_at_changed");
    expect(e).toBeTruthy();
    expect(e?.from_value).toBeNull();
    expect(e?.to_value).toBe(expectedAutoDefault());
  });

  it("emits check_back_at_changed event when value is set explicitly", async () => {
    seed({ status: "todo", check_back_at: null });
    const app = await buildApp();
    await request(app).patch("/tasks/task-1", { check_back_at: "2026-06-01" });
    const e = mock.insertedEvents.find((ev) => ev.kind === "check_back_at_changed");
    expect(e).toBeTruthy();
    expect(e?.from_value).toBeNull();
    expect(e?.to_value).toBe("2026-06-01");
  });

  it("emits check_back_at_changed event when value is cleared", async () => {
    seed({ status: "waiting_for_reply", check_back_at: "2026-05-15" });
    const app = await buildApp();
    await request(app).patch("/tasks/task-1", { check_back_at: null });
    const e = mock.insertedEvents.find((ev) => ev.kind === "check_back_at_changed");
    expect(e).toBeTruthy();
    expect(e?.from_value).toBe("2026-05-15");
    expect(e?.to_value).toBeNull();
  });

  it("emits check_back_at_changed event when value is changed from one date to another", async () => {
    seed({ status: "waiting_for_reply", check_back_at: "2026-05-15" });
    const app = await buildApp();
    await request(app).patch("/tasks/task-1", { check_back_at: "2026-06-30" });
    const e = mock.insertedEvents.find((ev) => ev.kind === "check_back_at_changed");
    expect(e).toBeTruthy();
    expect(e?.from_value).toBe("2026-05-15");
    expect(e?.to_value).toBe("2026-06-30");
  });

  it("does NOT emit check_back_at_changed when value is unchanged", async () => {
    seed({ status: "waiting_for_reply", check_back_at: "2026-05-15" });
    const app = await buildApp();
    await request(app).patch("/tasks/task-1", { name: "Renamed but same date" });
    const e = mock.insertedEvents.find((ev) => ev.kind === "check_back_at_changed");
    expect(e).toBeUndefined();
  });

  it("returns 400 when body has an invalid date string for check_back_at (not-a-date)", async () => {
    seed();
    const app = await buildApp();
    const r = await request(app).patch("/tasks/task-1", { check_back_at: "not-a-date" });
    expect(r.status).toBe(400);
  });

  it("returns 400 when body has a structurally invalid date for check_back_at (2026-13-99)", async () => {
    seed();
    const app = await buildApp();
    const r = await request(app).patch("/tasks/task-1", { check_back_at: "2026-13-99" });
    expect(r.status).toBe(400);
  });
});
