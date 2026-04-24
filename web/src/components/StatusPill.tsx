import clsx from "clsx";
import type { Status } from "../lib/types";
import { STATUS_LABEL, STATUS_ORDER } from "../lib/types";

const STYLE: Record<Status, string> = {
  todo: "bg-ink-100 text-ink-700 ring-ink-200",
  in_progress: "bg-amber-50 text-amber-800 ring-amber-200",
  done: "bg-emerald-50 text-emerald-800 ring-emerald-200",
};

export function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        STYLE[status]
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function StatusSelect({
  value,
  onChange,
  compact,
}: {
  value: Status;
  onChange: (s: Status) => void;
  compact?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Status)}
      onClick={(e) => e.stopPropagation()}
      className={clsx(
        "rounded-md border border-ink-200 bg-white font-medium text-ink-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400",
        compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs"
      )}
    >
      {STATUS_ORDER.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
