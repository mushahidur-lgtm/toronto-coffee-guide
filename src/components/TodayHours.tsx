"use client";

import { useEffect, useState } from "react";
import { todayStatus, todayStatusText } from "@/lib/hours";

/**
 * "Open until 6:00 PM" / "Opens today at 9:00 AM" / "Closed today · Opens tomorrow at 9:00 AM".
 * Computed in the browser (Toronto time) so statically cached pages never show a stale status; refreshes every
 * minute. Renders nothing when there are no readable hours, and an empty line of the same height until mounted
 * (no placeholder glyph, so text extraction and screen readers never see "…").
 */
export function TodayHours({ hours, compact = false }: { hours: string[] | null; compact?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!hours?.length) return null;
  if (!now) return <div className="h-5" aria-hidden />;

  const status = todayStatus(hours, now);
  if (!status) return null;
  const open = status.state === "open";
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span
        aria-hidden
        className={`inline-block size-2 shrink-0 rounded-full ${open ? "bg-[#3f7a30]" : "bg-line-strong"}`}
      />
      <span className={open ? "font-medium text-[#2f5a24]" : "text-ink-2"}>
        {compact ? todayStatusText(status).replace(/^Closed (today|now) · /, "Closed · ") : todayStatusText(status)}
      </span>
    </p>
  );
}
