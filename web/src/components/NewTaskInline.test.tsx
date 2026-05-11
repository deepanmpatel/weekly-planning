// NewTaskInline — "Work" quick-tag toggle.
//
// Per design:
//  - A link-styled toggle labelled "Work" sits in the chiclet row.
//  - Pressed state is reflected via aria-pressed (true/false).
//  - On submit while pressed, the newly created task gets the "work" tag attached.
//  - If a "work" tag does NOT exist in useTags(), clicking Work creates it
//    (useCreateTag) and then attaches it.
//
// SEAM NOTE for frontend-dev:
//  - The component currently mocks tag attach via `useAttachTag`. We assert
//    via the recorded calls to the mocked mutation.
//  - We assert pressed state via aria-pressed on a button whose name matches /work/i.
//    If the impl uses a different active-state attribute, update the assertion.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Tag, Task } from "../lib/types";

vi.mock("../lib/auth", () => ({ getAccessToken: () => Promise.resolve("x") }));
vi.mock("../lib/supabase", () => ({ supabase: {} }));
vi.mock("../lib/demoMode", () => ({ DEMO_MODE: true }));

const createTaskSpy = vi.fn();
const createTagSpy = vi.fn();
const attachTagSpy = vi.fn();
const updateTaskSpy = vi.fn();

let mockTags: Tag[] = [];

const WORK_TAG_ID = "tag-work";

function fakeTask(name: string): Task {
  return {
    id: "task-created",
    project_id: "proj-1",
    parent_task_id: null,
    assignee_id: null,
    name,
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
  };
}

vi.mock("../lib/api", () => {
  return {
    useCreateTask: () => ({
      mutateAsync: (input: Record<string, unknown>) => {
        createTaskSpy(input);
        return Promise.resolve(fakeTask(String(input.name)));
      },
      isPending: false,
    }),
    useUpdateTask: () => ({
      mutateAsync: (args: unknown) => {
        updateTaskSpy(args);
        return Promise.resolve(undefined);
      },
      isPending: false,
    }),
    useAttachTag: () => ({
      mutateAsync: (input: { taskId: string; tagId: string }) => {
        attachTagSpy(input);
        return Promise.resolve(undefined);
      },
      mutate: vi.fn(),
      isPending: false,
    }),
    useCreateTag: () => ({
      mutateAsync: (input: { name: string; color?: string }) => {
        createTagSpy(input);
        const tag: Tag = {
          id: WORK_TAG_ID,
          name: input.name,
          color: input.color ?? "#2563eb",
        };
        mockTags = [...mockTags, tag];
        return Promise.resolve(tag);
      },
      isPending: false,
    }),
    useTags: () => ({ data: mockTags }),
  };
});

import { NewTaskInline } from "./NewTaskInline";

function wrap(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("NewTaskInline — Work quick-tag", () => {
  beforeEach(() => {
    createTaskSpy.mockClear();
    createTagSpy.mockClear();
    attachTagSpy.mockClear();
    updateTaskSpy.mockClear();
    mockTags = [];
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a 'Work' quick-tag toggle button", () => {
    render(wrap(<NewTaskInline projectId="proj-1" />));
    // A button named "Work" should exist on the chiclet row.
    const btn = screen.getByRole("button", { name: /^work$/i });
    expect(btn).toBeInTheDocument();
  });

  it("toggles aria-pressed when the Work button is clicked", async () => {
    // Pre-seed the "work" tag so toggling is purely a selectedTagIds flip
    // (no async createTag race condition).
    mockTags = [{ id: WORK_TAG_ID, name: "work", color: "#2563eb" }];
    const user = userEvent.setup();
    render(wrap(<NewTaskInline projectId="proj-1" />));
    const btn = screen.getByRole("button", { name: /^work$/i });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    await user.click(btn);
    await waitFor(() =>
      expect(btn.getAttribute("aria-pressed")).toBe("true")
    );
    await user.click(btn);
    await waitFor(() =>
      expect(btn.getAttribute("aria-pressed")).toBe("false")
    );
  });

  it("on submit with Work pressed AND a 'work' tag already exists, attaches that tag to the created task", async () => {
    mockTags = [{ id: WORK_TAG_ID, name: "work", color: "#2563eb" }];
    const user = userEvent.setup();
    render(wrap(<NewTaskInline projectId="proj-1" />));
    const input = screen.getByPlaceholderText(/add a task/i);
    await user.type(input, "A new prioritized task");
    const work = screen.getByRole("button", { name: /^work$/i });
    await user.click(work);
    // Wait for the pressed-state flip to settle before submitting.
    await waitFor(() =>
      expect(work.getAttribute("aria-pressed")).toBe("true")
    );
    const submit = screen.getByRole("button", { name: /^add$/i });
    await user.click(submit);

    await waitFor(() => expect(createTaskSpy).toHaveBeenCalledTimes(1));
    expect(createTaskSpy.mock.calls[0][0]).toMatchObject({
      project_id: "proj-1",
      name: "A new prioritized task",
    });
    await waitFor(() =>
      expect(attachTagSpy).toHaveBeenCalledWith({
        taskId: "task-created",
        tagId: WORK_TAG_ID,
      })
    );
    // No tag creation because the tag already existed.
    expect(createTagSpy).not.toHaveBeenCalled();
  });

  it("on submit with Work pressed and NO 'work' tag in useTags(), creates it first then attaches", async () => {
    mockTags = []; // no work tag yet
    const user = userEvent.setup();
    render(wrap(<NewTaskInline projectId="proj-1" />));
    const input = screen.getByPlaceholderText(/add a task/i);
    await user.type(input, "Bootstrap the work tag");
    await user.click(screen.getByRole("button", { name: /^work$/i }));
    // After the async createTag mutation, the new tag id should be in
    // selectedTagIds. Wait for that to settle before submitting.
    await waitFor(() => expect(createTagSpy).toHaveBeenCalledTimes(1));
    expect(createTagSpy.mock.calls[0][0]).toMatchObject({ name: "work" });

    await user.click(screen.getByRole("button", { name: /^add$/i }));
    // Then attach the newly-created tag to the new task.
    await waitFor(() =>
      expect(attachTagSpy).toHaveBeenCalledWith({
        taskId: "task-created",
        tagId: WORK_TAG_ID,
      })
    );
  });

  it("on submit WITHOUT Work pressed, does not call attach for the work tag", async () => {
    mockTags = [{ id: WORK_TAG_ID, name: "work", color: "#2563eb" }];
    const user = userEvent.setup();
    render(wrap(<NewTaskInline projectId="proj-1" />));
    const input = screen.getByPlaceholderText(/add a task/i);
    await user.type(input, "Untagged task");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => expect(createTaskSpy).toHaveBeenCalledTimes(1));
    expect(attachTagSpy).not.toHaveBeenCalled();
    expect(createTagSpy).not.toHaveBeenCalled();
  });
});
