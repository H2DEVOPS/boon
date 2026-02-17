/**
 * domain/calendar.ts
 * Svensk projektkalender (SE) + manuella undantag.
 *
 * - Helg: lör/sön (konfigurerbar)
 * - Röda dagar: beräknas deterministiskt per år (ingen API)
 * - Overrides: semester/klämdag/stängt/extra arbetsdag (fritext)
 *
 * OBS: Cutoff 00:01 hanteras i partState/schedule, inte här.
 */

export type DateKey = string; // "YYYY-MM-DD"

/** Manuell kalenderhändelse (semester, stängt, extra arbetsdag, etc.) */
export interface CalendarOverride {
  readonly id: string;
  readonly date: DateKey;
  readonly isWorkingDay: boolean; // false = ledig, true = arbetsdag
  readonly label: string; // fritext: "Semester", "Klämdag", "Stängt", ...
  readonly note?: string;
}

/** Projektkalender */
export interface ProjectCalendar {
  readonly timezone: string; // ex "Europe/Stockholm"
  /** 0=Sun..6=Sat. Default [0,6] */
  readonly weekendDays: ReadonlyArray<number>;
  /** Manuella undantag (validera inga dubletter per datum) */
  readonly overrides: ReadonlyArray<CalendarOverride>;
}

/* -------------------------
 * Date helpers
 * ------------------------- */

export function parseDateKey(date: DateKey): { y: number; m: number; d: number } {
  const [ys, ms, ds] = date.split("-");
  return { y: Number(ys), m: Number(ms), d: Number(ds) };
}

export function formatDateKey(y: number, m: number, d: number): DateKey {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function nextDay(date: DateKey): DateKey {
  const { y, m, d } = parseDateKey(date);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)); // noon UTC for stability
  dt.setUTCDate(dt.getUTCDate() + 1);
  return formatDateKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function prevDay(date: DateKey): DateKey {
  const { y, m, d } = parseDateKey(date);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return formatDateKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function dateKeyFromDate(date: Date, timezone: string): DateKey {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date) as DateKey; // "YYYY-MM-DD"
}

export function weekdayOf(date: DateKey, timezone: string): number {
  const { y, m, d } = parseDateKey(date);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" });
  switch (fmt.format(dt)) {
    case "Sun":
      return 0;
    case "Mon":
      return 1;
    case "Tue":
      return 2;
    case "Wed":
      return 3;
    case "Thu":
      return 4;
    case "Fri":
      return 5;
    case "Sat":
      return 6;
    default:
      throw new Error("Unexpected weekday");
  }
}

function toKeyUTC(d: Date): DateKey {
  return d.toISOString().slice(0, 10);
}

function addDaysUTC(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function weekdayUTC(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function saturdayBetweenUTC(y: number, m: number, d1: number, d2: number): DateKey {
  for (let d = d1; d <= d2; d++) {
    if (weekdayUTC(y, m, d) === 6) return toKeyUTC(new Date(Date.UTC(y, m - 1, d)));
  }
  throw new Error("No Saturday in interval");
}

/* -------------------------
 * Swedish holidays (SE)
 * ------------------------- */

function easterSundayUTC(year: number): Date {
  // Meeus/Jones/Butcher (Gregorian)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=Mar, 4=Apr
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Svenska röda dagar (exkluderar weekend som koncept; de hanteras separat). */
export function swedishHolidays(year: number): Set<DateKey> {
  const res = new Set<DateKey>();

  // Fixed
  ["01-01", "01-06", "05-01", "06-06", "12-25", "12-26"].forEach((md) => res.add(`${year}-${md}`));

  // Easter-based
  const easter = easterSundayUTC(year);
  // Long Friday (-2), Easter Sunday (0), Easter Monday (+1), Ascension (+39), Pentecost (+49)
  [-2, 0, 1, 39, 49].forEach((offset) => res.add(toKeyUTC(addDaysUTC(easter, offset))));

  // Midsummer Day: Saturday between June 20–26
  res.add(saturdayBetweenUTC(year, 6, 20, 26));

  // All Saints' Day: Saturday between Oct 31 – Nov 6
  // Check Oct 31 then Nov 1-6
  if (weekdayUTC(year, 10, 31) === 6) res.add(`${year}-10-31`);
  for (let d = 1; d <= 6; d++) {
    if (weekdayUTC(year, 11, d) === 6) res.add(`${year}-11-${String(d).padStart(2, "0")}`);
  }

  return res;
}

/* -------------------------
 * Overrides + working day logic
 * ------------------------- */

export function validateOverridesUnique(overrides: ReadonlyArray<CalendarOverride>): void {
  const seen = new Set<DateKey>();
  for (const o of overrides) {
    if (seen.has(o.date)) throw new Error(`Duplicate override for date ${o.date}`);
    seen.add(o.date);
  }
}

function overridesIndex(overrides: ReadonlyArray<CalendarOverride>): ReadonlyMap<DateKey, CalendarOverride> {
  const m = new Map<DateKey, CalendarOverride>();
  for (const o of overrides) m.set(o.date, o);
  return m;
}

/** Beräknar om en dag är arbetsdag med svensk baseline + overrides. */
export function isWorkingDay(date: DateKey, cal: ProjectCalendar): boolean {
  const o = overridesIndex(cal.overrides).get(date);
  if (o) return o.isWorkingDay; // manual wins

  const { y } = parseDateKey(date);
  const seHolidays = swedishHolidays(y);
  if (seHolidays.has(date)) return false;

  const wd = weekdayOf(date, cal.timezone);
  if (cal.weekendDays.includes(wd)) return false;

  return true;
}

/**
 * Antal arbetsdagar i [start, end) (start inkl, end exkl).
 * Sign-aware: om end < start => negativt.
 */
export function diffWorkingDays(start: DateKey, endExclusive: DateKey, cal: ProjectCalendar): number {
  if (start === endExclusive) return 0;

  // walk forward or backward
  const forward = start < endExclusive;
  let cur = start;
  let n = 0;

  if (forward) {
    while (cur !== endExclusive) {
      if (isWorkingDay(cur, cal)) n += 1;
      cur = nextDay(cur);
    }
    return n;
  } else {
    // count backwards: [end, start)
    cur = endExclusive;
    while (cur !== start) {
      if (isWorkingDay(cur, cal)) n -= 1;
      cur = nextDay(cur);
    }
    return n;
  }
}

/**
 * Lägg till N arbetsdagar från start (N>=0).
 * - addWorkingDays(d,0) => d (oavsett working/icke-working; keep simple)
 * - addWorkingDays(d,1) => nästa arbetsdag efter d
 */
export function addWorkingDays(start: DateKey, days: number, cal: ProjectCalendar): DateKey {
  if (days < 0) throw new Error("days must be >= 0");
  let cur = start;
  let remaining = days;

  while (remaining > 0) {
    cur = nextDay(cur);
    if (isWorkingDay(cur, cal)) remaining -= 1;
  }
  return cur;
}

/**
 * Hitta nästa arbetsdag (inkluderar current om den är arbetsdag).
 */
export function nextWorkingDay(date: DateKey, cal: ProjectCalendar): DateKey {
  let cur = date;
  while (!isWorkingDay(cur, cal)) cur = nextDay(cur);
  return cur;
}

/**
 * Skapa standardkalender för Sverige.
 */
export function defaultSwedishProjectCalendar(overrides: CalendarOverride[] = []): ProjectCalendar {
  validateOverridesUnique(overrides);
  return {
    timezone: "Europe/Stockholm",
    weekendDays: [0, 6],
    overrides,
  };
}
