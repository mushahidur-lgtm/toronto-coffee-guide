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

/** "2026-11-15" → "November 2026" (date-only, so formatted in UTC to avoid shifting a day). */
export function formatMonthYear(isoDate: string): string {
  return new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** Today's hours text in Toronto ("7:00 AM – 6:00 PM", "Closed"), or null when unknown. */
export function todayHoursText(lines: string[] | null | undefined, now = new Date()): string | null {
  const today = todayName(now);
  return parseHours(lines).find((d) => d.day === today)?.hours ?? null;
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

// ---------------------------------------------------------------------------
// "Open until 6:00 PM" / "Closed today · Opens tomorrow at 9:00 AM"
// ---------------------------------------------------------------------------

/** 570 → "9:30 AM", 1440/1500 → "12:00 AM"/"1:00 AM" (times past midnight wrap). */
export function formatMinutes(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m % 60).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

export type TodayStatus =
  | { state: "open"; until: string; allDay?: boolean }
  | { state: "opens-later"; at: string }
  | { state: "closed"; closedAllDay: boolean; next: { day: string; at: string } | null };

/**
 * Today's status in Toronto, or null when the hours are missing or can't be read (the UI then shows nothing).
 * `next.day` is "tomorrow" or a weekday name; `next` is null when no opening is found in the coming week.
 */
export function todayStatus(lines: string[] | null | undefined, now = new Date()): TodayStatus | null {
  const days = parseHours(lines);
  if (!days.length) return null;
  const byDay = new Map(days.map((d) => [d.day, d.hours]));
  const { day, minutes } = torontoClock(now);
  const idx = DAYS.indexOf(day);
  const rangesFor = (offset: number) => {
    const text = byDay.get(DAYS[(idx + offset + 7) % 7]);
    return text === undefined ? null : parseDayRanges(text);
  };

  const today = rangesFor(0);
  if (today === null) return null;

  // Still inside last night's shift (e.g. open until 2:00 AM).
  const yesterday = rangesFor(-1);
  const carry = yesterday?.find((r) => r.end > 1440 && minutes < r.end - 1440);
  if (carry) return { state: "open", until: formatMinutes(carry.end) };

  const current = today.find((r) => minutes >= r.start && minutes < r.end);
  if (current) return { state: "open", until: formatMinutes(current.end), allDay: current.start === 0 && current.end === 1440 };

  const later = today.filter((r) => r.start > minutes).sort((a, b) => a.start - b.start)[0];
  if (later) return { state: "opens-later", at: formatMinutes(later.start) };

  let next: { day: string; at: string } | null = null;
  for (let d = 1; d <= 7; d++) {
    const r = rangesFor(d);
    if (r === null) break; // unknown day: don't guess past it
    if (r.length) {
      const first = [...r].sort((a, b) => a.start - b.start)[0];
      next = { day: d === 1 ? "tomorrow" : d === 7 ? `next ${DAYS[idx]}` : DAYS[(idx + d) % 7], at: formatMinutes(first.start) };
      break;
    }
  }
  return { state: "closed", closedAllDay: today.length === 0, next };
}

/** True when every listed day parses, i.e. a "Today" status can be computed whatever the day. */
export function hasReadableHours(lines: string[] | null | undefined): boolean {
  const days = parseHours(lines);
  return days.length === 7 && days.every((d) => parseDayRanges(d.hours) !== null);
}

/** One line for the UI: "Open until 4:00 PM", "Opens today at 9:00 AM", "Closed today · Opens tomorrow at 9:00 AM". */
export function todayStatusText(s: TodayStatus): string {
  if (s.state === "open") return s.allDay ? "Open 24 hours" : `Open until ${s.until}`;
  if (s.state === "opens-later") return `Opens today at ${s.at}`;
  const head = s.closedAllDay ? "Closed today" : "Closed now";
  return s.next ? `${head} · Opens ${s.next.day} at ${s.next.at}` : head;
}

// ---------------------------------------------------------------------------
// Verified hours, holidays
// ---------------------------------------------------------------------------

/** Today's date in Toronto as YYYY-MM-DD. */
export function torontoDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export interface HoursSource {
  opening_hours: string[] | null;
  current_hours?: string[] | null;
  special_dates?: string[];
  hours_source?: "google" | "editorial" | null;
}

export interface HoursInfo {
  /** Weekly schedule to show (regular hours). */
  weekly: string[] | null;
  status: TodayStatus | null;
  /** true only for hours fetched live from Google; editorial hours are never presented as verified. */
  verified: boolean;
  /** Today is a holiday / exceptional day and the status uses the holiday hours. */
  exceptional: boolean;
}

/**
 * One place that decides what "today" means for a cafe: holiday hours (Google's current hours) when today is a
 * listed special day, otherwise the regular weekly schedule. `status` is null when nothing readable is known.
 */
export function hoursInfo(c: HoursSource, now = new Date()): HoursInfo {
  const exceptional = !!c.current_hours?.length && !!c.special_dates?.includes(torontoDate(now));
  const lines = exceptional ? c.current_hours! : c.opening_hours;
  return {
    weekly: c.opening_hours,
    status: todayStatus(lines, now),
    verified: c.hours_source === "google",
    exceptional,
  };
}
