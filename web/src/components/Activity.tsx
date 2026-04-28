import type { TaskEvent } from "../lib/types";
import { STATUS_LABEL } from "../lib/types";

const KIND_ICON: Record<TaskEvent["kind"], string> = {
  created: "✨",
  renamed: "✏️",
  status_changed: "🔄",
  due_date_changed: "📅",
  description_changed: "📝",
  moved_project: "📁",
  reparented: "↕️",
  tag_added: "🏷️",
  tag_removed: "🏷️",
  comment_added: "💬",
  subtask_added: "➕",
  assigned: "👤",
  unassigned: "👤",
  today_flagged: "⭐",
  today_unflagged: "☆",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const s = Math.round(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function renderDescription(e: TaskEvent): React.ReactNode {
  const status = (v: string | null) =>
    v ? STATUS_LABEL[v as keyof typeof STATUS_LABEL] ?? v : "—";

  switch (e.kind) {
    case "created":
      return (
        <>
          Task created
          {e.to_value && (
            <>
              : <em>{e.to_value}</em>
            </>
          )}
        </>
      );
    case "renamed":
      return (
        <>
          Renamed from <em>“{e.from_value}”</em> to <em>“{e.to_value}”</em>
        </>
      );
    case "status_changed":
      return (
        <>
          Status changed from <strong>{status(e.from_value)}</strong> to{" "}
          <strong>{status(e.to_value)}</strong>
        </>
      );
    case "due_date_changed":
      if (!e.to_value) return <>Due date cleared</>;
      if (!e.from_value) return <>Due date set to {formatDate(e.to_value)}</>;
      return (
        <>
          Due date changed {formatDate(e.from_value)} → {formatDate(e.to_value)}
        </>
      );
    case "description_changed":
      return <>Description updated</>;
    case "moved_project":
      return (
        <>
          Moved from <strong>{e.from_value ?? "—"}</strong> to{" "}
          <strong>{e.to_value ?? "—"}</strong>
        </>
      );
    case "reparented":
      return <>Parent task changed</>;
    case "tag_added":
      return (
        <>
          Tag <strong>{e.to_value}</strong> added
        </>
      );
    case "tag_removed":
      return (
        <>
          Tag <strong>{e.from_value}</strong> removed
        </>
      );
    case "comment_added":
      return (
        <>
          Comment added
          {e.to_value && (
            <span className="text-ink-500"> — “{e.to_value}”</span>
          )}
        </>
      );
    case "subtask_added":
      return (
        <>
          Subtask added: <em>{e.to_value}</em>
        </>
      );
    case "assigned":
      return e.from_value ? (
        <>
          Reassigned from <strong>{e.from_value}</strong> to{" "}
          <strong>{e.to_value}</strong>
        </>
      ) : (
        <>
          Assigned to <strong>{e.to_value}</strong>
        </>
      );
    case "unassigned":
      return (
        <>
          Unassigned (was <strong>{e.from_value}</strong>)
        </>
      );
    case "today_flagged":
      return <>Added to Today</>;
    case "today_unflagged":
      return <>Removed from Today</>;
    default:
      return <>Unknown event</>;
  }
}

export function Activity({ events }: { events: TaskEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="text-xs text-ink-500">No activity yet.</div>
    );
  }
  return (
    <ol className="relative space-y-2 pl-5 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-ink-200">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-5 top-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] ring-1 ring-ink-200">
            {KIND_ICON[e.kind]}
          </span>
          <div className="text-xs text-ink-700">{renderDescription(e)}</div>
          <div
            className="text-[10px] text-ink-500"
            title={new Date(e.created_at).toLocaleString()}
          >
            {relativeTime(e.created_at)}
          </div>
        </li>
      ))}
    </ol>
  );
}
