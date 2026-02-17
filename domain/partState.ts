/**
 * Domain part state — lifecycle state machine for parts.
 * Cutoff is strictly 00:01:00 in timezone (never midnight).
 * Overdue uses project calendar (working days).
 */

import type { Timestamp } from "./core.js";
import { addWorkingDays, type ProjectCalendar } from "./calendar.js";

/** Date-only string (YYYY-MM-DD). */
export type DateOnly = string;

/** Part lifecycle state. */
export type PartState = "NotDue" | "Due" | "Overdue" | "Snoozed" | "Approved";

/** Inputs for state computation. */
export interface PartStateInputs {
  readonly endDate: DateOnly;
  readonly approved: boolean;
  readonly notificationDate?: DateOnly;
  readonly now: Timestamp;
  readonly timezone: string;
}

// --- Cutoff model ---
// cutoff(date) = date at 00:01:00 in timezone (NOT midnight).
// 00:00:00 – 00:00:59 → before cutoff
// 00:01:00 and later   → at or after cutoff

function getDateAndTimeInTz(
  ts: number,
  timezone: string
): { date: DateOnly; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(ts);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const date: DateOnly = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour"));
  const normalizedHour = hour === 24 ? 0 : hour;
  return { date, hour: normalizedHour, minute: Number(get("minute")) };
}

/** True iff now >= cutoff(dateOnly). Uses explicit date first, then time. */
function isAtOrPastCutoff(now: Timestamp, dateOnly: DateOnly, timezone: string): boolean {
  const { date, hour, minute } = getDateAndTimeInTz(now, timezone);
  if (date > dateOnly) return true;
  if (date < dateOnly) return false;
  // Same date: at or after 00:01:00. Midnight (00:00:00–00:00:59) is before cutoff.
  return hour > 0 || minute >= 1;
}

// --- Public API ---

/** Computes part state from inputs. Overdue uses first working day after endDate. */
export function computePartState(inputs: PartStateInputs, calendar: ProjectCalendar): PartState {
  const { endDate, approved, notificationDate, now, timezone } = inputs;

  if (approved) return "Approved";
  if (!isAtOrPastCutoff(now, endDate, timezone)) return "NotDue"; // now < cutoff(endDate)
  if (
    notificationDate != null &&
    !isAtOrPastCutoff(now, notificationDate, timezone)
  )
    return "Snoozed";
  const firstWorkingDayAfter = addWorkingDays(endDate, 1, calendar);
  if (isAtOrPastCutoff(now, firstWorkingDayAfter, timezone)) return "Overdue";
  return "Due"; // cutoff(endDate) <= now < cutoff(firstWorkingDayAfter)
}

/** True iff state is in Tasks list (Due | Overdue | Snoozed). */
export function isInTasks(state: PartState): boolean {
  return state === "Due" || state === "Overdue" || state === "Snoozed";
}
