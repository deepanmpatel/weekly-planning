import clsx from "clsx";
import type { Profile } from "../lib/types";

function initials(p: Partial<Profile> | null | undefined): string {
  if (!p) return "?";
  const name = p.display_name || p.email || "";
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(id: string | undefined): string {
  if (!id) return "#94a3b8";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 55% 48%)`;
}

export function Avatar({
  user,
  size = 24,
  className,
  title,
}: {
  user: Partial<Profile> | null | undefined;
  size?: number;
  className?: string;
  title?: string;
}) {
  const hint =
    title ?? user?.display_name ?? user?.email ?? "Unassigned";
  if (user?.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={hint}
        title={hint}
        width={size}
        height={size}
        className={clsx(
          "inline-block rounded-full bg-ink-200 object-cover ring-1 ring-white",
          className
        )}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      title={hint}
      className={clsx(
        "inline-flex items-center justify-center rounded-full font-semibold text-white ring-1 ring-white",
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, size * 0.4),
        backgroundColor: user ? colorFor(user.id) : "#cbd5e1",
      }}
    >
      {initials(user)}
    </span>
  );
}
