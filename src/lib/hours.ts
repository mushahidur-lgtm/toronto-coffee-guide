const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SHORT: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

export interface DayLine {
  day: string;
  hours: string;
}

/** Parse Google-style weekday descriptions ("Monday: 7:00 AM – 6:00 PM"). */
export function parseHours(lines: string[] | null | undefined): DayLine[] {
  if (!lines?.length) return [];
  return lines
    .map((l) => {
      const clean = l.replace(/[   ]/g, " ");
      const i = clean.indexOf(":");
      if (i === -1) return null;
      return { day: clean.slice(0, i).trim(), hours: clean.slice(i + 1).trim() };
    })
    .filter((x): x is DayLine => !!x && DAYS.includes(x.day));
}

/** Collapse consecutive days with identical hours: "Mon–Fri: 8:00 AM – 6:00 PM". */
export function groupHours(lines: string[] | null | undefined): DayLine[] {
  const parsed = parseHours(lines);
  const out: { start: string; end: string; hours: string }[] = [];
  for (const d of parsed) {
    const last = out[out.length - 1];
    if (last && last.hours === d.hours && DAYS.indexOf(d.day) === DAYS.indexOf(last.end) + 1) {
      last.end = d.day;
    } else {
      out.push({ start: d.day, end: d.day, hours: d.hours });
    }
  }
  return out.map((g) => ({
    day: g.start === g.end ? SHORT[g.start] : `${SHORT[g.start]}–${SHORT[g.end]}`,
    hours: g.hours,
  }));
}

/** Current weekday name in Toronto. */
export function todayName(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { weekday: "long", timeZone: "America/Toronto" }).format(now);
}
