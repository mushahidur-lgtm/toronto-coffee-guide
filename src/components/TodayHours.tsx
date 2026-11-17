"use client";

import { useEffect, useState } from "react";
import { isOpenNow, todayHoursText } from "@/lib/hours";

/**
 * "Open now · Today 8:00 AM – 6:00 PM". Computed in the browser (Toronto time) so statically cached pages never
 * show a stale status; refreshes every minute. Renders a quiet placeholder line until mounted.
 */
export function TodayHours({ hours, compact = false }: { hours: string[] | null; compact?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!hours?.length) return <p className="text-sm text-muted">Hours not listed</p>;
  if (!now) return <p className="h-5 text-sm text-transparent" aria-hidden>…</p>;

  const open = isOpenNow(hours, now);
  const today = todayHoursText(hours, now);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {open === true && <span className="rounded-full bg-[#e7f1e4] px-2 py-px text-[11px] font-semibold text-[#2f5a24]">Open now</span>}
      {open === false && <span className="rounded-full bg-wash px-2 py-px text-[11px] font-semibold text-muted">Closed</span>}
      <span className="text-ink-2">
        {compact ? "" : "Today: "}
        {today ?? "hours not listed"}
      </span>
    </p>
  );
}
