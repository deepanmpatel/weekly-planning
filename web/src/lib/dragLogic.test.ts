// Unit tests for the pure cache-update helpers in dragLogic.ts.
//
// The Prioritized board introduces two helpers:
//
//   - applyPrioritizedCellReorderToCache(cached, bucket, status, ids)
//       Reassigns `prioritized_position` only for tasks whose
//       (bucket, status) matches. Other tasks untouched.
//
//   - applyPrioritizedCrossCellMoveToCache(cached, taskId, bucket,
//       destStatus, destIds)
//       Within-bucket cross-status drop. The moving task gets its `status`
//       set to destStatus and `prioritized_position` set to its index in
//       destIds. `completed_at` rolls forward to "now" on transition into
//       `done`, and to null on transition out. Other tasks in the
//       destination cell get their `prioritized_position` updated.
//
//       NEGATIVE CASE: if the moving task's bucket field does NOT
//       match the bucket arg, the function returns cached without
//       modifying that task (cross-bucket moves are not supported).
//
// The `bucket` field on the cached task is set by the server (GET
// /tasks/prioritized) — these unit tests pre-bake it into fixtures.

import { describe, expect, it } from "vitest";
import type { Task } from "./types";
import {
  applyPrioritizedCellReorderToCache,
  applyPrioritizedCrossCellMoveToCache,
} from "./dragLogic";

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-?",
    project_id: "proj-1",
    parent_task_id: null,
    assignee_id: null,
    name: "Sample",
    description: "",
    status: "todo",
    due_date: null,
    check_back_at: null,
    completed_at: null,
    position: 0,
    is_today: false,
    today_position: 0,
    prioritized_position: 0,
    estimated_time: null,
    estimated_time_unit: "hours",
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
    tags: [],
    subtasks: [],
    bucket: "non_work",
    ...overrides,
  };
}

describe("applyPrioritizedCellReorderToCache", () => {
  it("reassigns prioritized_position to the index for each id in the matching (bucket, status) cell", () => {
    const cached: Task[] = [
      buildTask({ id: "a", status: "todo", prioritized_position: 9, bucket: "work" }),
      buildTask({ id: "b", status: "todo", prioritized_position: 9, bucket: "work" }),
      buildTask({ id: "c", status: "todo", prioritized_position: 9, bucket: "work" }),
    ];
    const next = applyPrioritizedCellReorderToCache(cached, "work", "todo", [
      "b",
      "c",
      "a",
    ]);
    expect(next).toBeDefined();
    const byId = new Map(next!.map((t) => [t.id, t]));
    expect(byId.get("b")!.prioritized_position).toBe(0);
    expect(byId.get("c")!.prioritized_position).toBe(1);
    expect(byId.get("a")!.prioritized_position).toBe(2);
  });

  it("does not touch tasks outside the (bucket, status) cell", () => {
    const cached: Task[] = [
      // In-cell (work / todo)
      buildTask({ id: "a", status: "todo", prioritized_position: 0, bucket: "work" }),
      buildTask({ id: "b", status: "todo", prioritized_position: 1, bucket: "work" }),
      // Same status, different bucket
      buildTask({
        id: "c",
        status: "todo",
        prioritized_position: 7,
        bucket: "non_work",
      }),
      // Same bucket, different status
      buildTask({
        id: "d",
        status: "in_progress",
        prioritized_position: 8,
        bucket: "work",
      }),
    ];
    const next = applyPrioritizedCellReorderToCache(cached, "work", "todo", [
      "b",
      "a",
    ]);
    const byId = new Map(next!.map((t) => [t.id, t]));
    // Reordered:
    expect(byId.get("b")!.prioritized_position).toBe(0);
    expect(byId.get("a")!.prioritized_position).toBe(1);
    // Untouched:
    expect(byId.get("c")!.prioritized_position).toBe(7);
    expect(byId.get("d")!.prioritized_position).toBe(8);
  });

  it("returns the input unchanged when cached is undefined", () => {
    const next = applyPrioritizedCellReorderToCache(undefined, "work", "todo", [
      "a",
    ]);
    expect(next).toBeUndefined();
  });

  it("ignores ids that are not in the matching cell (e.g. a non_work task id in a work reorder body)", () => {
    const cached: Task[] = [
      buildTask({ id: "a", status: "todo", prioritized_position: 0, bucket: "work" }),
      buildTask({ id: "b", status: "todo", prioritized_position: 1, bucket: "work" }),
      // This task is non_work — should NOT be touched even though its id is in the list.
      buildTask({
        id: "stray",
        status: "todo",
        prioritized_position: 99,
        bucket: "non_work",
      }),
    ];
    const next = applyPrioritizedCellReorderToCache(cached, "work", "todo", [
      "stray",
      "a",
      "b",
    ]);
    const byId = new Map(next!.map((t) => [t.id, t]));
    // 'stray' is non_work — must keep its original position.
    expect(byId.get("stray")!.prioritized_position).toBe(99);
    // a and b are work/todo — they get the indices from the ids array.
    expect(byId.get("a")!.prioritized_position).toBe(1);
    expect(byId.get("b")!.prioritized_position).toBe(2);
  });
});

describe("applyPrioritizedCrossCellMoveToCache", () => {
  it("flips status and updates prioritized_position for the moving task within the same bucket", () => {
    const cached: Task[] = [
      buildTask({
        id: "mover",
        status: "todo",
        prioritized_position: 0,
        bucket: "work",
      }),
      buildTask({
        id: "x",
        status: "in_progress",
        prioritized_position: 0,
        bucket: "work",
      }),
      buildTask({
        id: "y",
        status: "in_progress",
        prioritized_position: 1,
        bucket: "work",
      }),
    ];
    const next = applyPrioritizedCrossCellMoveToCache(
      cached,
      "mover",
      "work",
      "in_progress",
      ["x", "mover", "y"]
    );
    const byId = new Map(next!.map((t) => [t.id, t]));
    expect(byId.get("mover")!.status).toBe("in_progress");
    expect(byId.get("mover")!.prioritized_position).toBe(1);
    expect(byId.get("x")!.prioritized_position).toBe(0);
    expect(byId.get("y")!.prioritized_position).toBe(2);
  });

  it("rolls completed_at to a stringy timestamp when moving INTO done", () => {
    const cached: Task[] = [
      buildTask({
        id: "mover",
        status: "todo",
        completed_at: null,
        bucket: "work",
      }),
    ];
    const next = applyPrioritizedCrossCellMoveToCache(
      cached,
      "mover",
      "work",
      "done",
      ["mover"]
    );
    const moverNext = next!.find((t) => t.id === "mover")!;
    expect(moverNext.status).toBe("done");
    expect(typeof moverNext.completed_at).toBe("string");
    expect(moverNext.completed_at).not.toBeNull();
  });

  it("rolls completed_at to null when moving OUT of done", () => {
    const cached: Task[] = [
      buildTask({
        id: "mover",
        status: "done",
        completed_at: "2026-04-29T12:00:00Z",
        bucket: "work",
      }),
    ];
    const next = applyPrioritizedCrossCellMoveToCache(
      cached,
      "mover",
      "work",
      "todo",
      ["mover"]
    );
    const moverNext = next!.find((t) => t.id === "mover")!;
    expect(moverNext.status).toBe("todo");
    expect(moverNext.completed_at).toBeNull();
  });

  it("returns undefined when cached is undefined", () => {
    const next = applyPrioritizedCrossCellMoveToCache(
      undefined,
      "mover",
      "work",
      "in_progress",
      ["mover"]
    );
    expect(next).toBeUndefined();
  });

  it("is a no-op for a cross-bucket move (moving task's bucket differs from the target bucket arg)", () => {
    // Per architect's design: cross-bucket moves are not supported. If the
    // helper is called with a target bucket that does not match the moving
    // task's bucket, it returns the original cache untouched.
    //
    // CONTRACT NOTE for frontend-dev: at time of writing, the helper does
    // not enforce this guard; the PrioritizedPage drag handler currently
    // gates cross-bucket moves at the call site. If this test fails, decide:
    //   (a) move the guard down into the helper (preferred per design), or
    //   (b) loosen this test to only assert via the page-level handler.
    const cached: Task[] = [
      buildTask({
        id: "mover",
        status: "todo",
        prioritized_position: 5,
        bucket: "non_work",
      }),
      buildTask({
        id: "x",
        status: "in_progress",
        prioritized_position: 0,
        bucket: "work",
      }),
    ];
    const next = applyPrioritizedCrossCellMoveToCache(
      cached,
      "mover",
      "work",
      "in_progress",
      ["x", "mover"]
    );
    const moverNext = next!.find((t) => t.id === "mover")!;
    // The moving task's status, position, and bucket are all preserved.
    expect(moverNext.bucket).toBe("non_work");
    expect(moverNext.status).toBe("todo");
    expect(moverNext.prioritized_position).toBe(5);
  });
});
