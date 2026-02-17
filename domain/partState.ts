/**
 * Domain part state — lifecycle state machine for parts.
 * Uses cutoff 00:01 + timezone. No external libs.
 */

import type { Timestamp } from "./core.js";

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

// --- Cutoff helpers ---
// cutoff(date) = date at 00:01 in timezone (not midnight).
// now < cutoff(date)  → before cutoff (previous state)
// now >= cutoff(date) → at or past cutoff

function getDateAndTimeInTz(ts: number, timezone: string): { date: DateOnly; time: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(ts);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const date: DateOnly = `${get("year")}-${get("month")}-${get("day")}`;
  const time = `${get("hour")}:${get("minute")}:${get("second")}`;
  return { date, time };
}

/** True iff now >= cutoff(dateOnly), i.e. at or past 00:01 on that date in timezone. */
function isAtOrPastCutoff(now: Timestamp, dateOnly: DateOnly, timezone: string): boolean {
  const { date, time } = getDateAndTimeInTz(now, timezone);
  if (date > dateOnly) return true;
  if (date < dateOnly) return false;
  return time >= "00:01:00"; // 00:00:00–00:00:59 stays before cutoff (no implicit midnight)
}

function addDays(dateOnly: DateOnly, days: number): DateOnly {
  const d = new Date(`${dateOnly}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10) as DateOnly;
}

// --- Public API ---

/** Computes part state from inputs. */
export function computePartState(inputs: PartStateInputs): PartState {
  const { endDate, approved, notificationDate, now, timezone } = inputs;

  if (approved) return "Approved";
  if (!isAtOrPastCutoff(now, endDate, timezone)) return "NotDue"; // now < cutoff(endDate)
  if (
    notificationDate != null &&
    !isAtOrPastCutoff(now, notificationDate, timezone)
  )
    return "Snoozed";
  if (isAtOrPastCutoff(now, addDays(endDate, 1), timezone)) return "Overdue"; // now >= cutoff(endDate+1)
  return "Due"; // cutoff(endDate) <= now < cutoff(endDate+1)
}

/** True iff state is in Tasks list (Due | Overdue | Snoozed). */
export function isInTasks(state: PartState): boolean {
  return state === "Due" || state === "Overdue" || state === "Snoozed";
}
