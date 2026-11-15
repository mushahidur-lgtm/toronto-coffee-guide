/**
 * Tests for the "Open now" hours parser.   npx tsx scripts/test-hours.ts
 */
import { isOpenNow, parseDayRanges, torontoClock } from "../src/lib/hours";
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

console.log(`\n${failed ? `${failed} FAILED` : "all passed"}`);
process.exit(failed ? 1 : 0);
