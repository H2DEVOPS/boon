/**
 * Domain working days — workday calendar engine.
 * No external libs.
 */

/** Date-only string (YYYY-MM-DD). Reuse from partState or define locally. */
export type DateOnly = string;

/** Working day config. workdays: 1–7 (Mon–Sun, ISO). */
export interface WorkingDayConfig {
  readonly workdays: number[];
  readonly holidays?: readonly DateOnly[];
}

const DEFAULT_WORKDAYS = [1, 2, 3, 4, 5];

function getConfig(config: WorkingDayConfig): {
  workdays: Set<number>;
  holidays: Set<string>;
} {
  const workdays = new Set(config.workdays.length > 0 ? config.workdays : DEFAULT_WORKDAYS);
  const holidays = new Set(config.holidays ?? []);
  return { workdays, holidays };
}

/** ISO weekday 1–7 (Mon=1, Sun=7). */
function isoWeekday(dateOnly: DateOnly): number {
  const d = new Date(`${dateOnly}T12:00:00Z`);
  const utcDay = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  return utcDay === 0 ? 7 : utcDay;
}

function addCalendarDays(dateOnly: DateOnly, days: number): DateOnly {
  const d = new Date(`${dateOnly}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10) as DateOnly;
}

/** True if date is a working day. */
export function isWorkingDay(date: DateOnly, config: WorkingDayConfig): boolean {
  const { workdays, holidays } = getConfig(config);
  if (holidays.has(date)) return false;
  return workdays.has(isoWeekday(date));
}

/** Next working day on or after date. */
export function nextWorkingDay(date: DateOnly, config: WorkingDayConfig): DateOnly {
  let d = date;
  while (!isWorkingDay(d, config)) {
    d = addCalendarDays(d, 1);
  }
  return d;
}

/** Add working days. amount=0 → same date if working else next working. */
export function addWorkingDays(
  date: DateOnly,
  amount: number,
  config: WorkingDayConfig
): DateOnly {
  if (amount === 0) {
    return isWorkingDay(date, config) ? date : nextWorkingDay(date, config);
  }
  if (amount > 0) {
    let d = date;
    let remaining = amount;
    while (remaining > 0) {
      d = addCalendarDays(d, 1);
      if (isWorkingDay(d, config)) remaining--;
    }
    return d;
  }
  // amount < 0
  let d = date;
  let remaining = -amount;
  while (remaining > 0) {
    d = addCalendarDays(d, -1);
    if (isWorkingDay(d, config)) remaining--;
  }
  return d;
}

/** Working days between from and to. Sign-aware: to < from → negative. */
export function diffWorkingDays(
  from: DateOnly,
  to: DateOnly,
  config: WorkingDayConfig
): number {
  if (to < from) return -diffWorkingDays(to, from, config);
  if (from === to) return 0;
  let count = 0;
  let d = addCalendarDays(from, 1);
  while (d <= to) {
    if (isWorkingDay(d, config)) count++;
    d = addCalendarDays(d, 1);
  }
  return count;
}
