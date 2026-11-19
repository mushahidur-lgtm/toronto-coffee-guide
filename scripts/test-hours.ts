/**
 * Tests for the "Open now" hours parser.   npx tsx scripts/test-hours.ts
 */
import { hoursInfo, isOpenNow, parseDayRanges, todayStatus, todayStatusText, torontoClock } from "../src/lib/hours";
import { normalizeCafe } from "../src/lib/normalize-cafe";
import { applyFilters, EMPTY_FILTERS, indexCafe } from "../src/lib/search";

const week = (text: string) =>
  ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => `${d}: ${text}`);
/** A Date at the given Toronto wall-clock time on 2026-11-16 (a Monday, EST = UTC-5). */
const at = (day: number, hh: number, mm = 0) => new Date(Date.UTC(2026, 10, 16 + day, hh + 5, mm));

let failed = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label.padEnd(58)} → ${JSON.stringify(got)}${ok ? "" : `  (want ${JSON.stringify(want)})`}`);
};

check("clock: Mon 09:30 Toronto", torontoClock(at(0, 9, 30)), { day: "Monday", minutes: 570 });
check("parse 7:00 AM – 6:00 PM (Google thin spaces)", parseDayRanges("7:00 AM – 6:00 PM"), [{ start: 420, end: 1080 }]);
check("parse split shift, inherited PM", parseDayRanges("11:00 AM – 2:00 PM, 5:00 – 10:00 PM"), [{ start: 660, end: 840 }, { start: 1020, end: 1320 }]);
check("parse 11:00 – 2:00 PM (start must be AM)", parseDayRanges("11:00 – 2:00 PM"), [{ start: 660, end: 840 }]);
check("parse overnight 6:00 PM – 2:00 AM", parseDayRanges("6:00 PM – 2:00 AM"), [{ start: 1080, end: 1560 }]);
check("parse closes at midnight", parseDayRanges("8:00 AM – 12:00 AM"), [{ start: 480, end: 1440 }]);
check("parse Open 24 hours", parseDayRanges("Open 24 hours"), [{ start: 0, end: 1440 }]);
check("parse Closed", parseDayRanges("Closed"), []);
check("parse garbage", parseDayRanges("By appointment"), null);

const nineToFive = week("9:00 AM – 5:00 PM");
check("open 9–5, Mon 08:59", isOpenNow(nineToFive, at(0, 8, 59)), false);
check("open 9–5, Mon 09:00", isOpenNow(nineToFive, at(0, 9, 0)), true);
check("open 9–5, Mon 16:59", isOpenNow(nineToFive, at(0, 16, 59)), true);
check("open 9–5, Mon 17:00 (closing time = closed)", isOpenNow(nineToFive, at(0, 17, 0)), false);
const closedMonday = ["Monday: Closed", ...nineToFive.slice(1)];
check("closed Mondays, Mon 12:00", isOpenNow(closedMonday, at(0, 12)), false);
check("closed Mondays, Tue 12:00", isOpenNow(closedMonday, at(1, 12)), true);
const lateBar = week("6:00 PM – 2:00 AM");
check("overnight, Tue 01:30 (from Monday's shift)", isOpenNow(lateBar, at(1, 1, 30)), true);
check("overnight, Tue 02:30", isOpenNow(lateBar, at(1, 2, 30)), false);
const split = week("11:00 AM – 2:00 PM, 5:00 – 10:00 PM");
check("split shift, 15:00 (gap)", isOpenNow(split, at(0, 15)), false);
check("split shift, 18:00", isOpenNow(split, at(0, 18)), true);
check("no hours", isOpenNow(null, at(0, 12)), null);
check("unparseable today", isOpenNow(week("By appointment"), at(0, 12)), null);
check("DST: Sat 2026-07-04 09:30 EDT", isOpenNow(nineToFive, new Date(Date.UTC(2026, 6, 4, 13, 30))), true);

// "Today" line: Open until / Opens today at / Closed today · Opens <day> at, or nothing.
const line = (lines: string[] | null, d: Date) => {
  const st = todayStatus(lines, d);
  return st ? todayStatusText(st) : null;
};
check("today: 9–5 at Mon 12:00", line(nineToFive, at(0, 12)), "Open until 5:00 PM");
check("today: 9–5 at Mon 07:00", line(nineToFive, at(0, 7)), "Opens today at 9:00 AM");
check("today: 9–5 at Mon 18:00", line(nineToFive, at(0, 18)), "Closed now · Opens tomorrow at 9:00 AM");
// Cocoon-style week: closed Mon + Tue, open Wed–Sun 9–4.
const wedToSun = ["Monday: Closed", "Tuesday: Closed", ...week("9:00 AM – 4:00 PM").slice(2)];
check("today: closed Mon/Tue, Tue 10:00", line(wedToSun, at(1, 10)), "Closed today · Opens tomorrow at 9:00 AM");
check("today: closed Mon/Tue, Mon 10:00", line(wedToSun, at(0, 10)), "Closed today · Opens Wednesday at 9:00 AM");
const oneDay = ["Monday: Closed", "Tuesday: Closed", "Wednesday: Closed", "Thursday: Closed", "Friday: Closed", "Saturday: 10:00 AM – 2:00 PM", "Sunday: Closed"];
check("today: only Saturdays, Mon 12:00", line(oneDay, at(0, 12)), "Closed today · Opens Saturday at 10:00 AM");
check("today: only Saturdays, Sat 15:00", line(oneDay, at(5, 15)), "Closed now · Opens next Saturday at 10:00 AM");
check("today: split shift 15:00", line(split, at(0, 15)), "Opens today at 5:00 PM");
check("today: split shift 12:00", line(split, at(0, 12)), "Open until 2:00 PM");
check("today: overnight Mon 23:00", line(lateBar, at(0, 23)), "Open until 2:00 AM");
check("today: overnight Tue 01:30 (Monday's shift)", line(lateBar, at(1, 1, 30)), "Open until 2:00 AM");
check("today: closes at midnight", line(week("8:00 AM – 12:00 AM"), at(0, 20)), "Open until 12:00 AM");
check("today: open 24 hours", line(week("Open 24 hours"), at(0, 3)), "Open 24 hours");
check("today: no hours", line(null, at(0, 12)), null);
check("today: unparseable", line(week("By appointment"), at(0, 12)), null);
check("today: never opens again", line(week("Closed"), at(0, 12)), "Closed today");

// End to end through the search filters: unknown hours are excluded while "Open now" is on.
const idx = [
  normalizeCafe({ name: "Day Cafe", neighbourhood: "Chinatown", opening_hours: nineToFive }),
  normalizeCafe({ name: "Night Bar", neighbourhood: "Chinatown", opening_hours: lateBar }),
  normalizeCafe({ name: "Unknown Hours", neighbourhood: "Chinatown" }),
].map(indexCafe);
const names = (d: Date) => applyFilters(idx, { ...EMPTY_FILTERS, openNow: true }, d).map((h) => h.cafe.name);
check("filter Mon 12:00 → Day Cafe only", names(at(0, 12)), ["Day Cafe"]);
check("filter Mon 20:00 → Night Bar only", names(at(0, 20)), ["Night Bar"]);
check("filter off → all three", applyFilters(idx, EMPTY_FILTERS, at(0, 12)).length, 3);

// Verification and holidays: only live Google hours count as verified; a listed special day uses the holiday hours.
const hi = (o: object, d: Date) => {
  const i = hoursInfo({ opening_hours: nineToFive, ...o }, d);
  return { text: i.status ? todayStatusText(i.status) : null, verified: i.verified, exceptional: i.exceptional };
};
check("hours: editorial is not verified", hi({ hours_source: "editorial" }, at(0, 12)), { text: "Open until 5:00 PM", verified: false, exceptional: false });
check("hours: google is verified", hi({ hours_source: "google" }, at(0, 12)).verified, true);
check("hours: no hours gives no status", hoursInfo({ opening_hours: null }, at(0, 12)).status, null);
const holiday = { hours_source: "google" as const, current_hours: week("Closed"), special_dates: ["2026-11-16"] };
check("hours: holiday today closes the cafe", hi(holiday, at(0, 12)), { text: "Closed today", verified: true, exceptional: true });
check("hours: holiday on another day is ignored", hi(holiday, at(1, 12)).exceptional, false);
check("hours: Toronto date after UTC midnight", hi(holiday, new Date(Date.UTC(2026, 10, 17, 2, 0))).exceptional, true);

console.log(`\n${failed ? `${failed} FAILED` : "all passed"}`);
process.exit(failed ? 1 : 0);
