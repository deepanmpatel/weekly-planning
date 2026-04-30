// Demo store parity guarantee for check_back_at.
//
// The demo store mirrors the real Express API. These tests exercise PATCH and
// PUT reorder through `demoFetch` and assert the same behavior described by
// server/test/tasks.patch.test.ts and server/test/projects.reorder.test.ts.
//
// SEAM NOTE for frontend-dev:
// `demoStore.ts` keeps state in module-level variables. To get a clean slate
// per test, we use `vi.resetModules()` and a dynamic `await import(...)`
// before each test.
//
// We freeze the system clock to 2026-04-30 PT so the auto-default (today+7d)
// is deterministic.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DemoFetch = <T>(path: string, init?: RequestInit) => Promise<T>;

let demoFetch: DemoFetch;

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

interface DemoTask {
  id: string;
  status: string;
  check_back_at: string | null;
  events?: Array<{ kind: string; from_value: string | null; to_value: string | null }>;
}

async function getTask(id: string): Promise<DemoTask> {
  return demoFetch<DemoTask>(`/tasks/${id}`);
}

async function patchTask(id: string, patch: Record<string, unknown>): Promise<DemoTask> {
  return demoFetch<DemoTask>(`/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

async function reorder(
  projectId: string,
  cols: { todo: string[]; in_progress: string[]; waiting_for_reply: string[]; done: string[] }
): Promise<void> {
  await demoFetch<void>(`/projects/${projectId}/tasks/reorder`, {
    method: "PUT",
    body: JSON.stringify(cols),
  });
}

describe("demoStore — check_back_at parity with server", () => {
  beforeEach(async () => {
    // Freeze "wall clock" only (Date.now()), but leave setTimeout/setInterval
    // alive — demoFetch uses setTimeout(30) to simulate latency.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-04-30T12:00:00Z"));
    vi.resetModules();
    const mod = await import("./demoStore");
    demoFetch = mod.demoFetch as DemoFetch;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("PATCH /tasks/:id", () => {
    it("auto-defaults check_back_at to today+7d (PT) when status transitions INTO waiting_for_reply with null existing", async () => {
      // t-1 starts as todo, check_back_at: null in the seed
      const after = await patchTask("t-1", { status: "waiting_for_reply" });
      expect(after.check_back_at).toBe(expectedAutoDefault());
    });

    it("does NOT clobber an explicit check_back_at in body when transitioning to waiting_for_reply", async () => {
      const after = await patchTask("t-1", {
        status: "waiting_for_reply",
        check_back_at: "2026-06-01",
      });
      expect(after.check_back_at).toBe("2026-06-01");
    });

    it("preserves an existing non-null check_back_at when transitioning to waiting_for_reply", async () => {
      // First set a value, then move to waiting_for_reply without sending it
      await patchTask("t-1", { check_back_at: "2026-05-15" });
      const after = await patchTask("t-1", { status: "waiting_for_reply" });
      expect(after.check_back_at).toBe("2026-05-15");
    });

    it("preserves check_back_at when status moves OUT of waiting_for_reply (does NOT auto-clear)", async () => {
      // t-6a is the seeded waiting_for_reply task; it should have a populated date
      const seeded = await getTask("t-6a");
      expect(seeded.status).toBe("waiting_for_reply");
      expect(seeded.check_back_at).toBe("2026-05-03");

      const after = await patchTask("t-6a", { status: "todo" });
      expect(after.check_back_at).toBe("2026-05-03");
    });

    it("clears check_back_at when body sends explicit null", async () => {
      await patchTask("t-1", { check_back_at: "2026-05-15" });
      const after = await patchTask("t-1", { check_back_at: null });
      expect(after.check_back_at).toBeNull();
    });

    it("emits check_back_at_changed event on auto-default flip from null to today+7", async () => {
      await patchTask("t-1", { status: "waiting_for_reply" });
      const detail = await getTask("t-1");
      const evs = detail.events ?? [];
      const e = evs.find((x) => x.kind === "check_back_at_changed");
      expect(e).toBeTruthy();
      expect(e?.from_value).toBeNull();
      expect(e?.to_value).toBe(expectedAutoDefault());
    });

    it("emits check_back_at_changed event when value is set explicitly", async () => {
      await patchTask("t-1", { check_back_at: "2026-06-01" });
      const detail = await getTask("t-1");
      const e = (detail.events ?? []).find((x) => x.kind === "check_back_at_changed");
      expect(e).toBeTruthy();
      expect(e?.from_value).toBeNull();
      expect(e?.to_value).toBe("2026-06-01");
    });

    it("emits check_back_at_changed event when value is cleared", async () => {
      await patchTask("t-6a", { check_back_at: null });
      const detail = await getTask("t-6a");
      const e = (detail.events ?? []).find((x) => x.kind === "check_back_at_changed");
      expect(e).toBeTruthy();
      expect(e?.from_value).toBe("2026-05-03");
      expect(e?.to_value).toBeNull();
    });

    it("emits check_back_at_changed event when value is changed from one date to another", async () => {
      await patchTask("t-6a", { check_back_at: "2026-06-30" });
      const detail = await getTask("t-6a");
      const e = (detail.events ?? []).find((x) => x.kind === "check_back_at_changed");
      expect(e).toBeTruthy();
      expect(e?.from_value).toBe("2026-05-03");
      expect(e?.to_value).toBe("2026-06-30");
    });

    it("does NOT emit check_back_at_changed when value is unchanged", async () => {
      await patchTask("t-6a", { name: "Renamed but same date" });
      const detail = await getTask("t-6a");
      const e = (detail.events ?? []).find((x) => x.kind === "check_back_at_changed");
      expect(e).toBeUndefined();
    });
  });

  describe("PUT /projects/:id/tasks/reorder", () => {
    it("auto-defaults check_back_at when a task moves INTO waiting_for_reply with null existing", async () => {
      // t-1 is in p-family, status todo, check_back_at null.
      // Move it into waiting_for_reply via reorder.
      await reorder("p-family", {
        todo: ["t-3"],
        in_progress: ["t-2"],
        waiting_for_reply: ["t-1"],
        done: ["t-4"],
      });
      const after = await getTask("t-1");
      expect(after.status).toBe("waiting_for_reply");
      expect(after.check_back_at).toBe(expectedAutoDefault());
    });

    it("does NOT change check_back_at when a task already in waiting_for_reply is reordered within the column", async () => {
      // First move t-7 into waiting_for_reply with an explicit value
      await patchTask("t-7", {
        status: "waiting_for_reply",
        check_back_at: "2026-05-20",
      });
      // Now reorder p-banyan such that t-6a and t-7 stay in waiting_for_reply (different order)
      await reorder("p-banyan", {
        todo: ["t-6"],
        in_progress: ["t-5"],
        waiting_for_reply: ["t-7", "t-6a"],
        done: [],
      });
      const t7 = await getTask("t-7");
      const t6a = await getTask("t-6a");
      expect(t7.check_back_at).toBe("2026-05-20");
      expect(t6a.check_back_at).toBe("2026-05-03");
    });

    it("preserves an existing non-null check_back_at when the task moves INTO waiting_for_reply", async () => {
      await patchTask("t-1", { check_back_at: "2026-05-22" });
      await reorder("p-family", {
        todo: ["t-3"],
        in_progress: ["t-2"],
        waiting_for_reply: ["t-1"],
        done: ["t-4"],
      });
      const after = await getTask("t-1");
      expect(after.check_back_at).toBe("2026-05-22");
    });

    it("emits BOTH status_changed AND check_back_at_changed when auto-default fires via reorder", async () => {
      await reorder("p-family", {
        todo: ["t-3"],
        in_progress: ["t-2"],
        waiting_for_reply: ["t-1"],
        done: ["t-4"],
      });
      const detail = await getTask("t-1");
      const kinds = (detail.events ?? []).map((e) => e.kind);
      expect(kinds).toContain("status_changed");
      expect(kinds).toContain("check_back_at_changed");
    });

    it("does NOT clear check_back_at when a task moves OUT of waiting_for_reply via reorder", async () => {
      // t-6a is seeded as waiting_for_reply with check_back_at "2026-05-03"
      await reorder("p-banyan", {
        todo: ["t-6", "t-7", "t-6a"],
        in_progress: ["t-5"],
        waiting_for_reply: [],
        done: [],
      });
      const after = await getTask("t-6a");
      expect(after.status).toBe("todo");
      expect(after.check_back_at).toBe("2026-05-03");
    });
  });
});
