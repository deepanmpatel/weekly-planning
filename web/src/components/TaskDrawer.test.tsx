// TaskDrawer — check_back_at field UX.
//
// Per design:
//  - Native <input type="date"> between Due and Estimate
//  - Persists on onChange (calls useUpdateTask with `{check_back_at}`)
//  - Clear button only when value is set; clicking it sends `{check_back_at: null}`
//
// SEAM NOTE for frontend-dev:
// We mock the entire `../lib/api` module to inject our own hook stubs (in
// particular, useUpdateTask returns a `mutate` we can spy on). Other hooks
// return safe empty defaults so the component renders.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import type { Task } from "../lib/types";

const mutateSpy = vi.fn();
const mutateAsyncSpy = vi.fn().mockResolvedValue(undefined);
const taskSubscribers = new Set<() => void>();
function notifyTaskSubscribers() {
  taskSubscribers.forEach((fn) => fn());
}

const fakeTask: Task = {
  id: "t-1",
  project_id: "p-1",
  parent_task_id: null,
  assignee_id: null,
  name: "Sample task",
  description: "",
  status: "waiting_for_reply",
  due_date: null,
  completed_at: null,
  position: 0,
  is_today: false,
  today_position: 0,
  estimated_time: null,
  estimated_time_unit: "hours",
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-04-01T00:00:00Z",
  tags: [],
  subtasks: [],
  comments: [],
  events: [],
  // @ts-expect-error — frontend-dev will add this field to Task
  check_back_at: "2026-05-07",
};

vi.mock("../lib/auth", () => ({ getAccessToken: () => Promise.resolve("x") }));
vi.mock("../lib/supabase", () => ({ supabase: {} }));
vi.mock("../lib/demoMode", () => ({ DEMO_MODE: true }));

vi.mock("../lib/api", () => {
  const noop = () => Promise.resolve(undefined as unknown);
  return {
    useTask: () => {
      const [, setTick] = useState(0);
      useEffect(() => {
        const fn = () => setTick((c) => c + 1);
        taskSubscribers.add(fn);
        return () => {
          taskSubscribers.delete(fn);
        };
      }, []);
      return { data: fakeTask, isLoading: false };
    },
    useUpdateTask: () => ({
      mutate: (args: { id: string; patch: Partial<Task> }) => {
        mutateSpy(args);
        Object.assign(fakeTask, args.patch);
        notifyTaskSubscribers();
      },
      mutateAsync: noop,
      isPending: false,
    }),
    useDeleteTask: () => ({ mutate: vi.fn() }),
    useAddComment: () => ({ mutateAsync: mutateAsyncSpy, isPending: false }),
    useTags: () => ({ data: [] }),
    useUsers: () => ({ data: [] }),
    useMe: () => ({ data: null }),
    useCreateTask: () => ({ mutateAsync: noop, isPending: false }),
    useCreateTag: () => ({ mutateAsync: mutateAsyncSpy, isPending: false }),
    useAttachTag: () => ({ mutate: vi.fn(), mutateAsync: noop }),
    useDetachTag: () => ({ mutate: vi.fn() }),
  };
});

import { TaskDrawer } from "./TaskDrawer";

function wrap(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("TaskDrawer — check_back_at field", () => {
  beforeEach(() => {
    mutateSpy.mockReset();
    mutateAsyncSpy.mockReset();
    mutateAsyncSpy.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    // Restore mutable state on the fixture for tests that mutate it
    // @ts-expect-error
    fakeTask.check_back_at = "2026-05-07";
  });

  it("rendering a task with check_back_at: '2026-05-07' shows a date input pre-populated with that value", () => {
    // @ts-expect-error
    fakeTask.check_back_at = "2026-05-07";
    render(wrap(<TaskDrawer taskId="t-1" onClose={() => {}} />));
    // The check-back input is rendered as an <input type="date"> with value
    // "2026-05-07". There may be other date inputs (due_date) on the form, so
    // we look for the one matching this value.
    const dateInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="date"]')
    );
    const match = dateInputs.find((i) => i.value === "2026-05-07");
    expect(match).toBeTruthy();
  });

  it("changing the input fires useUpdateTask with { check_back_at: '<new-iso>' }", async () => {
    // @ts-expect-error
    fakeTask.check_back_at = "2026-05-07";
    render(wrap(<TaskDrawer taskId="t-1" onClose={() => {}} />));

    const dateInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="date"]')
    );
    const input = dateInputs.find((i) => i.value === "2026-05-07");
    expect(input).toBeTruthy();

    const user = userEvent.setup();
    await user.clear(input!);
    await user.type(input!, "2026-06-01");

    const calls = mutateSpy.mock.calls
      .map((c) => c[0])
      .filter((p) => p && p.patch && Object.prototype.hasOwnProperty.call(p.patch, "check_back_at"));
    expect(calls.length).toBeGreaterThan(0);
    const last = calls[calls.length - 1];
    expect(last.id).toBe("t-1");
    expect(last.patch.check_back_at).toBe("2026-06-01");
  });

  it("Clear button only renders when check_back_at is set", () => {
    // case 1: value is set → button visible
    // @ts-expect-error
    fakeTask.check_back_at = "2026-05-07";
    const { unmount } = render(wrap(<TaskDrawer taskId="t-1" onClose={() => {}} />));
    expect(screen.queryByRole("button", { name: /clear check.?back/i })).toBeInTheDocument();
    unmount();

    // case 2: value null → button absent
    // @ts-expect-error
    fakeTask.check_back_at = null;
    render(wrap(<TaskDrawer taskId="t-1" onClose={() => {}} />));
    expect(screen.queryByRole("button", { name: /clear check.?back/i })).not.toBeInTheDocument();
  });

  it("Clear button fires useUpdateTask with { check_back_at: null }", async () => {
    // @ts-expect-error
    fakeTask.check_back_at = "2026-05-07";
    render(wrap(<TaskDrawer taskId="t-1" onClose={() => {}} />));
    const btn = screen.getByRole("button", { name: /clear check.?back/i });
    const user = userEvent.setup();
    await user.click(btn);

    const last = mutateSpy.mock.calls.at(-1)?.[0];
    expect(last).toBeTruthy();
    expect(last.id).toBe("t-1");
    expect(last.patch).toEqual({ check_back_at: null });
  });
});
