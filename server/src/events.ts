import { supabase } from "./supabase.js";

export type EventKind =
  | "created"
  | "renamed"
  | "status_changed"
  | "due_date_changed"
  | "check_back_at_changed"
  | "description_changed"
  | "moved_project"
  | "reparented"
  | "tag_added"
  | "tag_removed"
  | "comment_added"
  | "subtask_added"
  | "assigned"
  | "unassigned"
  | "today_flagged"
  | "today_unflagged"
  | "estimated_time_changed";

export interface EventInput {
  task_id: string;
  kind: EventKind;
  from_value?: string | null;
  to_value?: string | null;
  meta?: Record<string, unknown>;
}

export async function logEvent(e: EventInput) {
  const { error } = await supabase.from("task_events").insert({
    task_id: e.task_id,
    kind: e.kind,
    from_value: e.from_value ?? null,
    to_value: e.to_value ?? null,
    meta: e.meta ?? {},
  });
  if (error) console.error("logEvent failed:", error.message);
}

export async function logEvents(events: EventInput[]) {
  if (events.length === 0) return;
  const { error } = await supabase.from("task_events").insert(
    events.map((e) => ({
      task_id: e.task_id,
      kind: e.kind,
      from_value: e.from_value ?? null,
      to_value: e.to_value ?? null,
      meta: e.meta ?? {},
    }))
  );
  if (error) console.error("logEvents failed:", error.message);
}
