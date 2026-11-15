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

// ---------------------------------------------------------------------------
// "Open now"
// ---------------------------------------------------------------------------

/** Weekday name and minutes since midnight, in America/Toronto. */
export function torontoClock(now = new Date()): { day: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: get("weekday"), minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
}

type Meridiem = "AM" | "PM" | null;

function parseClock(s: string): { h: number; m: number; mer: Meridiem } | null {
  const t = s.trim().toLowerCase();
  if (t === "noon") return { h: 12, m: 0, mer: "PM" };
  if (t === "midnight") return { h: 12, m: 0, mer: "AM" };
  const match = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2] ?? 0);
  if (h > 24 || m > 59) return null;
  const mer: Meridiem = match[3] ? (match[3].startsWith("a") ? "AM" : "PM") : null;
  return { h, m, mer };
}

function toMinutes(c: { h: number; m: number }, mer: Meridiem): number {
  let h = c.h;
  if (mer === "AM" && h === 12) h = 0;
  if (mer === "PM" && h < 12) h += 12;
  return h * 60 + c.m;
}

/**
 * Parse one day's hours ("7:00 AM – 6:00 PM", "11:00 AM – 2:00 PM, 5:00 – 10:00 PM", "Open 24 hours", "Closed")
 * into [start, end) minute ranges. `end` can exceed 1440 for hours past midnight. null = couldn't parse.
 */
export function parseDayRanges(text: string): { start: number; end: number }[] | null {
  const t = text.replace(/[   ]/g, " ").trim();
  if (/^closed$/i.test(t)) return [];
  if (/open 24 hours/i.test(t)) return [{ start: 0, end: 1440 }];
  const ranges: { start: number; end: number }[] = [];
  for (const part of t.split(",")) {
    const [a, b] = part.split(/\s*(?:–|—|-|to)\s*/i);
    if (!a || !b) return null;
    const s = parseClock(a);
    const e = parseClock(b);
    if (!s || !e) return null;
    // Google omits the opening AM/PM when it matches the closing one ("5:00 – 10:00 PM").
    const endMer = e.mer ?? s.mer;
    let start = toMinutes(s, s.mer ?? endMer);
    let end = toMinutes(e, endMer);
    if (!s.mer && start > end) start = toMinutes(s, endMer === "PM" ? "AM" : "PM"); // "11:00 – 2:00 PM"
    if (end <= start) end += 1440; // closes after midnight
    ranges.push({ start, end });
  }
  return ranges;
}

/**
 * Is the cafe open at `now` (Toronto time)? true / false, or null when hours are unknown or unparseable.
 * Handles split shifts and hours that run past midnight (checked against yesterday's line).
 */
export function isOpenNow(lines: string[] | null | undefined, now = new Date()): boolean | null {
  const days = parseHours(lines);
  if (!days.length) return null;
  const { day, minutes } = torontoClock(now);
  const byDay = new Map(days.map((d) => [d.day, d.hours]));
  const todayText = byDay.get(day);
  if (todayText === undefined) return null;
  const today = parseDayRanges(todayText);
  if (today === null) return null;
  if (today.some((r) => minutes >= r.start && minutes < r.end)) return true;

  const yesterdayName = DAYS[(DAYS.indexOf(day) + 6) % 7];
  const yText = byDay.get(yesterdayName);
  const yesterday = yText ? parseDayRanges(yText) : null;
  if (yesterday?.some((r) => r.end > 1440 && minutes < r.end - 1440)) return true;
  return false;
}
