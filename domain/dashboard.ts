/**
 * Domain dashboard — list rules for tasks, quality, anomalies.
 * Cutoff logic delegated to partState (computePartState / isInTasks).
 */

import type { Timestamp } from "./core.js";
import { computePartState, isInTasks } from "./partState.js";

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

// --- Public API ---

/** Returns task list: parts in Tasks (Due | Overdue | Snoozed); ordered by status then endDate. */
export function taskList(
  parts: readonly Part[],
  now: Timestamp,
  timezone: string
): TaskItem[] {
  const items: TaskItem[] = [];
  for (const p of parts) {
    const state = computePartState({
      endDate: p.endDate,
      approved: p.approved,
      ...(p.notificationDate != null && { notificationDate: p.notificationDate }),
      now,
      timezone,
    });
    if (!isInTasks(state)) continue;

    const status: TaskItem["status"] = state === "Snoozed" ? "Snoozed" : "ActionRequired";
    const overdue = state === "Overdue";
    items.push({ partId: p.partId, status, endDate: p.endDate, overdue });
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
