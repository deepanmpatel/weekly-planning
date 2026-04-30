// Today-PT midnight (the most-recent one, in the past) as a UTC ISO string.
// Used by the lazy cleanup in GET /tasks/today to evict tasks completed before today.
export function todayPtMidnightUtcIso(): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const y = get("year");
  const m = get("month");
  const d = get("day");
  const hh = get("hour") === "24" ? "00" : get("hour");
  const mm = get("minute");
  const ss = get("second");
  const nowMs = Date.UTC(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(hh),
    Number(mm),
    Number(ss)
  );
  const ptOffsetMs = nowMs - Date.now();
  const midnightPtAsUtc = Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0);
  return new Date(midnightPtAsUtc - ptOffsetMs).toISOString();
}

export function todayPtIsoDate(daysFromNow = 7): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(Date.now() + daysFromNow * 86_400_000));
}

// Midnight America/Los_Angeles of the date that is 2 weekdays before today's PT
// date (Sat/Sun skipped — holidays not modeled). A done task whose completed_at
// predates this cutoff has been visible for >= 2 business days and is evicted
// on the next /tasks/today fetch.
export function staleDoneCutoffUtcIso(): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  const hh = get("hour") === "24" ? 0 : Number(get("hour"));
  const mm = Number(get("minute"));
  const ss = Number(get("second"));
  const nowMs = Date.UTC(y, m - 1, d, hh, mm, ss);
  const ptOffsetMs = nowMs - Date.now();

  let cutoff = new Date(Date.UTC(y, m - 1, d));
  let remaining = 2;
  while (remaining > 0) {
    cutoff = new Date(cutoff.getTime() - 86_400_000);
    const dow = cutoff.getUTCDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  const cutoffMidnightAsUtc = Date.UTC(
    cutoff.getUTCFullYear(),
    cutoff.getUTCMonth(),
    cutoff.getUTCDate(),
    0,
    0,
    0
  );
  return new Date(cutoffMidnightAsUtc - ptOffsetMs).toISOString();
}
