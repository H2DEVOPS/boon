/**
 * Domain dashboard — list rules for tasks, quality, anomalies.
 * Consumes projections only. No raw dates, no cutoff logic, no mutable flags.
 */

import type { Timestamp } from "./core.js";
import type { ProjectCalendar } from "./calendar.js";
import type { PartLifecycleEvent } from "./events.js";
import {
  projectDashboardState,
  type PartBase,
  type TaskItem,
} from "./projections.js";

/** Date-only string (YYYY-MM-DD). */
export type DateOnly = string;

/** Part model — minimal fields. State derived from event stream. */
export type Part = PartBase;

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

/** Task list item. Re-exported from projections. */
export type { TaskItem } from "./projections.js";

// --- Public API ---

/** Returns task list via projection. Parts + events + now → TaskItem[]. */
export function taskList(
  parts: readonly Part[],
  events: readonly PartLifecycleEvent[],
  now: Timestamp,
  timezone: string,
  calendar: ProjectCalendar
): TaskItem[] {
  return projectDashboardState(parts, events, now, timezone, calendar);
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
