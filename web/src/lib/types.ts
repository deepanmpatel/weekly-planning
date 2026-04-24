export type Status = "todo" | "in_progress" | "done";

export const STATUS_LABEL: Record<Status, string> = {
  todo: "To-Do",
  in_progress: "In Progress",
  done: "Done",
};

export const STATUS_ORDER: Status[] = ["todo", "in_progress", "done"];

export interface Project {
  id: string;
  name: string;
  position: number;
  created_at: string;
  task_count?: number;
  done_count?: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Comment {
  id: string;
  task_id: string;
  body: string;
  created_at: string;
}

export type TaskEventKind =
  | "created"
  | "renamed"
  | "status_changed"
  | "due_date_changed"
  | "description_changed"
  | "moved_project"
  | "reparented"
  | "tag_added"
  | "tag_removed"
  | "comment_added"
  | "subtask_added"
  | "assigned"
  | "unassigned";

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface TaskEvent {
  id: string;
  task_id: string;
  kind: TaskEventKind;
  from_value: string | null;
  to_value: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  assignee_id: string | null;
  name: string;
  description: string;
  status: Status;
  due_date: string | null;
  completed_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  tags?: Tag[];
  subtasks?: Task[];
  comments?: Comment[];
  events?: TaskEvent[];
  project_name?: string | null;
  assignee?: Profile | null;
}
