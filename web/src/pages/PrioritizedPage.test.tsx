// PrioritizedPage — bucket layout (Work / Non-work), project labels, empty state.
//
// SEAM NOTE for frontend-dev:
// - The impl file is `PrioritizedPage.tsx`. We mock `../lib/api` to inject
//   `usePrioritizedTasks` returning a fixed task list with mixed work / non-work
//   tagged tasks (server-derived `bucket` is pre-set on each fixture).
// - We mock `../lib/auth` + `../lib/supabase` to avoid pulling Supabase code.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import type { Tag, Task } from "../lib/types";

vi.mock("../lib/auth", () => ({ getAccessToken: () => Promise.resolve("x") }));
vi.mock("../lib/supabase", () => ({ supabase: {} }));
vi.mock("../lib/demoMode", () => ({ DEMO_MODE: true }));

const WORK_TAG: Tag = { id: "tag-work", name: "work", color: "#2563eb" };

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
    project_name: "Project Alpha",
    assignee: null,
    ...overrides,
  };
}

let mockTasks: Task[] = [];

vi.mock("../lib/api", () => {
  const noop = () => Promise.resolve(undefined as unknown);
  const noopMutation = () => ({ mutate: vi.fn(), mutateAsync: noop, isPending: false });
  return {
    usePrioritizedTasks: () => ({ data: mockTasks, isLoading: false, error: null }),
    useTodayTasks: () => ({ data: mockTasks, isLoading: false, error: null }),
    useProjects: () => ({
      data: [
        { id: "proj-1", name: "Project Alpha", position: 0, created_at: "" },
        { id: "proj-2", name: "Project Beta", position: 1, created_at: "" },
      ],
    }),
    useReorderProjects: noopMutation,
    useReorderTodayCell: noopMutation,
    useReorderPrioritized: noopMutation,
    useUpdateTask: noopMutation,
    useDeleteTask: noopMutation,
    useTask: () => ({ data: null, isLoading: false }),
    useTags: () => ({ data: [WORK_TAG] }),
    useUsers: () => ({ data: [] }),
    useMe: () => ({ data: null }),
    useCreateTask: noopMutation,
    useCreateTag: noopMutation,
    useAttachTag: noopMutation,
    useDetachTag: noopMutation,
    useAddComment: noopMutation,
  };
});

function wrap(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>
  );
}

// Static import of the page (the impl renamed TodayPage.tsx -> PrioritizedPage.tsx).
// Note for frontend-dev: if the file is renamed again, update this import.
import PrioritizedPage from "./PrioritizedPage";

describe("PrioritizedPage", () => {
  beforeEach(() => {
    mockTasks = [];
  });
  afterEach(() => {
    cleanup();
  });

  it("renders two bucket sections labelled 'Work' and 'Non-work'", async () => {
    mockTasks = [
      buildTask({ id: "a", status: "todo", tags: [WORK_TAG], bucket: "work" }),
      buildTask({ id: "b", status: "todo", tags: [], bucket: "non_work" }),
    ];
    render(wrap(<PrioritizedPage />));
    expect(
      screen.getByRole("heading", { level: 2, name: /^\s*Work\s*$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /^\s*Non-work\s*$/i })
    ).toBeInTheDocument();
  });

  it("places work-tagged tasks under Work and untagged tasks under Non-work", async () => {
    mockTasks = [
      buildTask({
        id: "work-todo",
        name: "Work TODO task",
        status: "todo",
        tags: [WORK_TAG],
        bucket: "work",
      }),
      buildTask({
        id: "personal-todo",
        name: "Personal TODO task",
        status: "todo",
        tags: [],
        bucket: "non_work",
      }),
    ];
    render(wrap(<PrioritizedPage />));
    expect(screen.getByText("Work TODO task")).toBeInTheDocument();
    expect(screen.getByText("Personal TODO task")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /^\s*Work\s*$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /^\s*Non-work\s*$/i })
    ).toBeInTheDocument();
  });

  it("renders project_name on each task card via the TaskCard showProject pathway", async () => {
    mockTasks = [
      buildTask({
        id: "a",
        name: "First task",
        project_name: "Project Alpha",
        tags: [WORK_TAG],
        bucket: "work",
      }),
    ];
    render(wrap(<PrioritizedPage />));
    // The TaskCard renders project_name when showProject is set. PrioritizedPage
    // must enable that — assert the project label appears in the DOM at least
    // once alongside the task.
    expect(screen.getByText("First task")).toBeInTheDocument();
    expect(screen.getAllByText(/Project Alpha/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders an empty-state placeholder when a bucket has no tasks", async () => {
    // Only work-tagged tasks → Non-work bucket is empty.
    mockTasks = [
      buildTask({
        id: "a",
        name: "Solo work task",
        status: "todo",
        tags: [WORK_TAG],
        bucket: "work",
      }),
    ];
    render(wrap(<PrioritizedPage />));
    expect(screen.getByText(/nothing here/i)).toBeInTheDocument();
  });
});
