/**
 * Domain dashboard — list rules for tasks, quality, anomalies.
 * Uses schedule logic: cutoff 00:01 + timezone.
 */

import type { Timestamp } from "./core.js";

/** Date-only string (YYYY-MM-DD). */
export type DateOnly = string;

/** Part model — minimal fields for task list. */
export interface Part {
  readonly partId: string;
  readonly endDate: DateOnly;
  readonly approved: boolean;
  readonly notificationDate?: DateOnly;
}

/** Quality item state. */
export type QualityState = "NotStarted" | "Ongoing" | "Done";

/** Quality item. */
export interface QualityItem {
  readonly id: string;
  readonly partId: string;
  readonly state: QualityState;
  readonly startDate: DateOnly;
  readonly dueDate: DateOnly;
}

/** Anomaly state. */
export type AnomalyState = "Open" | "Ongoing" | "Resolved";

/** Anomaly priority. */
export type AnomalyPriority = 1 | 2 | 3;

/** Anomaly. */
export interface Anomaly {
  readonly id: string;
  readonly partId: string;
  readonly createdAt: number; // Timestamp ms
  readonly state: AnomalyState;
  readonly priority: AnomalyPriority;
}

/** Task list item. */
export interface TaskItem {
  readonly partId: string;
  readonly status: "ActionRequired" | "Snoozed";
  readonly endDate: DateOnly;
  readonly overdue: boolean;
}

// --- Schedule / cutoff helpers ---

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

/** True if now >= cutoff(dateOnly) — i.e. past 00:01 on that date in timezone. */
function isPastCutoff(now: Timestamp, dateOnly: DateOnly, timezone: string): boolean {
  const { date, time } = getDateAndTimeInTz(now, timezone);
  return date > dateOnly || (date === dateOnly && time >= "00:01:00");
}

function addDays(dateOnly: DateOnly, days: number): DateOnly {
  const d = new Date(`${dateOnly}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10) as DateOnly;
}

// --- Public API ---

/** Returns task list: parts past cutoff(endDate), not approved; ordered by status then endDate. */
export function taskList(
  parts: readonly Part[],
  now: Timestamp,
  timezone: string
): TaskItem[] {
  const items: TaskItem[] = [];
  for (const p of parts) {
    if (!p.approved && isPastCutoff(now, p.endDate, timezone)) {
      const status: TaskItem["status"] =
        p.notificationDate != null && !isPastCutoff(now, p.notificationDate, timezone)
          ? "Snoozed"
          : "ActionRequired";
      const overdue = isPastCutoff(now, addDays(p.endDate, 1), timezone);
      items.push({ partId: p.partId, status, endDate: p.endDate, overdue });
    }
  }
  const statusOrder = { ActionRequired: 0, Snoozed: 1 };
  items.sort((a, b) => {
    if (statusOrder[a.status] !== statusOrder[b.status])
      return statusOrder[a.status] - statusOrder[b.status];
    if (a.endDate !== b.endDate) return a.endDate.localeCompare(b.endDate);
    return a.partId.localeCompare(b.partId);
  });
  return items;
}

const QUALITY_STATE_ORDER: Record<QualityState, number> = {
  Ongoing: 0,
  NotStarted: 1,
  Done: 2,
};

/** Returns quality items sorted: dueDate asc, state (Ongoing first), startDate asc, partId. */
export function qualityList(items: readonly QualityItem[]): QualityItem[] {
  return [...items].sort((a, b) => {
    if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    const sa = QUALITY_STATE_ORDER[a.state];
    const sb = QUALITY_STATE_ORDER[b.state];
    if (sa !== sb) return sa - sb;
    if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
    return a.partId.localeCompare(b.partId);
  });
}

/** Returns anomalies where state !== Resolved; sorted by createdAt asc, then partId. */
export function anomalyList(anomalies: readonly Anomaly[]): Anomaly[] {
  return [...anomalies]
    .filter((a) => a.state !== "Resolved")
    .sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return a.partId.localeCompare(b.partId);
    });
}
