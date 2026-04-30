// TaskCard — check_back_at badge UX.
//
// Per user decision: badge appears whenever check_back_at is set, regardless
// of status (NOT gated by waiting_for_reply only). Amber badge "Xd to check
// back" when daysUntil > 0; red badge "⚠ Check back" when daysUntil <= 0.
//
// SEAM NOTE for frontend-dev:
// - The component uses `useUpdateTask()` from "../lib/api". We render the
//   component inside a fresh QueryClientProvider so the hook does not throw.
// - The badge text patterns asserted below ("Xd to check back" or "Check back")
//   are intentionally tested via `getByText` with a matcher function so the
//   test is forgiving of surrounding emoji/whitespace. Pick wording in the
//   implementation that contains those substrings.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Task } from "../lib/types";

// Avoid pulling Supabase/auth code in the unit test
vi.mock("../lib/auth", () => ({
  getAccessToken: () => Promise.resolve("fake-token"),
}));
vi.mock("../lib/supabase", () => ({ supabase: {} }));
vi.mock("../lib/demoMode", () => ({ DEMO_MODE: true }));

import { TaskCard } from "./TaskCard";

function wrap(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    project_id: "p-1",
    parent_task_id: null,
    assignee_id: null,
    name: "Sample task",
    description: "",
    status: "todo",
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
    // @ts-expect-error — frontend-dev will add `check_back_at` to Task in lib/types.ts
    check_back_at: null,
    ...overrides,
  } as Task;
}

describe("TaskCard — check_back_at badge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Pin to a specific local date so "today" is stable
    vi.setSystemTime(new Date("2026-04-30T15:00:00Z"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders amber 'Xd to check back' badge when check_back_at is in the future and status is waiting_for_reply", () => {
    // 2026-05-07 is 7 days after 2026-04-30
    const task = buildTask({
      status: "waiting_for_reply",
      // @ts-expect-error
      check_back_at: "2026-05-07",
    });
    render(wrap(<TaskCard task={task} />));
    expect(screen.getByText(/to check back/i)).toBeInTheDocument();
  });

  it("renders amber badge ALSO when status is todo (badge ungated by status)", () => {
    const task = buildTask({
      status: "todo",
      // @ts-expect-error
      check_back_at: "2026-05-07",
    });
    render(wrap(<TaskCard task={task} />));
    expect(screen.getByText(/to check back/i)).toBeInTheDocument();
  });

  it("renders red 'Check back' badge when check_back_at is today (daysUntil === 0)", () => {
    const task = buildTask({
      status: "waiting_for_reply",
      // @ts-expect-error
      check_back_at: "2026-04-30",
    });
    render(wrap(<TaskCard task={task} />));
    // Should NOT render the amber "Xd to check back" copy
    expect(screen.queryByText(/\d+d to check back/i)).not.toBeInTheDocument();
    // Should render an indicator with "Check back" text
    expect(screen.getByText(/check back/i)).toBeInTheDocument();
  });

  it("renders red 'Check back' badge when check_back_at is in the past (daysUntil < 0)", () => {
    const task = buildTask({
      status: "waiting_for_reply",
      // @ts-expect-error
      check_back_at: "2026-04-15",
    });
    render(wrap(<TaskCard task={task} />));
    expect(screen.queryByText(/\d+d to check back/i)).not.toBeInTheDocument();
    expect(screen.getByText(/check back/i)).toBeInTheDocument();
  });

  it("renders nothing related to check-back when check_back_at is null", () => {
    const task = buildTask({
      status: "waiting_for_reply",
      // @ts-expect-error
      check_back_at: null,
    });
    render(wrap(<TaskCard task={task} />));
    expect(screen.queryByText(/to check back/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/check back/i)).not.toBeInTheDocument();
  });

  it("title attribute on the check-back badge contains the formatted date string", () => {
    const task = buildTask({
      status: "waiting_for_reply",
      // @ts-expect-error
      check_back_at: "2026-05-07",
    });
    render(wrap(<TaskCard task={task} />));
    // The element conveying check-back state should have a title that mentions
    // the formatted date (e.g. "May 7" or "May 7, 2026").
    const found = screen
      .getAllByTitle(/Need to check back on/i)
      .filter((el) => /May\s*7/i.test(el.getAttribute("title") ?? ""));
    expect(found.length).toBeGreaterThan(0);
  });

  it("renders the check-back badge alongside the due-date badge when both are set", () => {
    const task = buildTask({
      status: "waiting_for_reply",
      due_date: "2026-05-10",
      // @ts-expect-error
      check_back_at: "2026-05-07",
    });
    render(wrap(<TaskCard task={task} />));
    // Due-date badge uses 📅 prefix in the existing component
    expect(screen.getByText(/May 10/)).toBeInTheDocument();
    expect(screen.getByText(/to check back/i)).toBeInTheDocument();
  });
});
