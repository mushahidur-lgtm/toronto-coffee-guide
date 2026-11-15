import { groupHours, parseHours } from "@/lib/hours";

interface Props {
  hours: string[] | null;
  /** grouped = "Mon–Fri: …" (cards); full = one row per day (detail page). */
  variant?: "grouped" | "full";
  source?: "google" | "editorial" | null;
  today?: string;
}

export function Hours({ hours, variant = "grouped", source, today }: Props) {
  const rows = variant === "full" ? parseHours(hours) : groupHours(hours);
  if (!rows.length) return <p className="text-muted">Not available</p>;
  return (
    <div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
        {rows.map((r) => {
          const isToday = variant === "full" && today === r.day;
          return (
            <div key={r.day} className={`contents ${isToday ? "font-medium text-ink" : ""}`}>
              <dt className={isToday ? "" : "text-muted"}>
                {r.day}
                {isToday && <span className="sr-only"> (today)</span>}
              </dt>
              <dd className="tabular-nums">{r.hours}</dd>
            </div>
          );
        })}
      </dl>
      {source === "google" && <p className="mt-1.5 text-[11px] text-muted">Hours from Google Maps</p>}
    </div>
  );
}
