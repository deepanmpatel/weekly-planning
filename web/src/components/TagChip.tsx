import clsx from "clsx";
import type { Tag } from "../lib/types";

function hexToRgba(hex: string, alpha: number) {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m) return `rgba(100,116,139,${alpha})`;
  const [r, g, b] = m.map((c) => parseInt(c, 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

export function TagChip({
  tag,
  onRemove,
  compact,
}: {
  tag: Tag;
  onRemove?: () => void;
  compact?: boolean;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset",
        compact ? "px-1.5 py-[1px] text-[10px]" : "px-2 py-0.5 text-[11px]"
      )}
      style={{
        backgroundColor: hexToRgba(tag.color, 0.12),
        color: tag.color,
        borderColor: "transparent",
        boxShadow: `inset 0 0 0 1px ${hexToRgba(tag.color, 0.35)}`,
      }}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          className="ml-0.5 text-current/60 hover:text-current"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${tag.name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
