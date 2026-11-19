"use client";

import { useEffect, useState } from "react";
import { hoursInfo, todayStatusText, type HoursSource } from "@/lib/hours";

/**
 * "Open until 6:00 PM" / "Opens today at 9:00 AM" / "Closed today · Opens tomorrow at 9:00 AM", or "Hours not verified"
 * when we have no readable hours. Computed in the browser (Toronto time) so statically cached pages never show a
 * stale status; refreshes every minute. Hours that did not come live from Google carry "(not verified)" and holiday
 * hours are labelled. Renders an empty line of the same height until mounted.
 */
export function TodayHours({ cafe, compact = false, linkTo }: { cafe: HoursSource; compact?: boolean; linkTo?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!now) return <div className="h-5" aria-hidden />;

  const info = hoursInfo(cafe, now);
  const status = info.status;
  if (!status) return <p className="text-sm text-muted">Hours not verified</p>;
  const open = status.state === "open";
  const text = compact ? todayStatusText(status).replace(/^Closed (today|now) · /, "Closed · ") : todayStatusText(status);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${open ? "bg-[#3f7a30]" : "bg-line-strong"}`} />
      <span className={open ? "font-medium text-[#2f5a24]" : "text-ink-2"}>{text}</span>
      {info.exceptional && <span className="text-xs text-muted">Holiday hours</span>}
      {!info.verified && <span className="text-xs text-muted">(not verified)</span>}
      {linkTo && (
        <a href={linkTo} className="link-quiet text-xs">
          Weekly hours
        </a>
      )}
    </p>
  );
}
