/**
 * Deterministic state projections. Single source of truth = event stream.
 * No Date.now — all time injected.
 */

import type { Timestamp } from "./core.js";
import type { ProjectCalendar } from "./calendar.js";
import { computePartState, isInTasks, type PartState } from "./partState.js";
import type { PartLifecycleEvent } from "./events.js";

/** Part with minimal fields — no boolean flags. */
export interface PartBase {
  readonly partId: string;
  readonly endDate: string; // DateOnly/DateKey
}

/** Projected part state inputs from event stream. */
export interface ProjectedPartInputs {
  readonly approved: boolean;
  readonly notificationDate?: string;
}

function projectPartInputs(
  events: readonly PartLifecycleEvent[],
  partId: string
): ProjectedPartInputs {
  const partEvents = events
    .filter((e) => e.partId === partId)
    .sort((a, b) => a.timestamp - b.timestamp);

  let approved = false;
  let notificationDate: string | undefined;

  for (const e of partEvents) {
    if (e.type === "PartApproved") {
      approved = true;
      notificationDate = undefined; // reopen clears snooze
    } else if (e.type === "PartReopened") {
      approved = false;
      notificationDate = undefined;
    } else if (e.type === "PartSnoozed") {
      notificationDate = e.notificationDate;
    }
  }

  return { approved, ...(notificationDate != null && { notificationDate }) };
}

/** Pure projection: part state from events. */
export function projectPartState(
  events: readonly PartLifecycleEvent[],
  partId: string,
  endDate: string,
  now: Timestamp,
  timezone: string,
  calendar: ProjectCalendar
): PartState {
  const { approved, notificationDate } = projectPartInputs(events, partId);
  return computePartState(
    {
      endDate,
      approved,
      ...(notificationDate != null && { notificationDate }),
      now,
      timezone,
    },
    calendar
  );
}

/** Projected dashboard task list. Parts + events + now → TaskItem[]. */
export interface TaskItem {
  readonly partId: string;
  readonly status: "ActionRequired" | "Snoozed";
  readonly endDate: string;
  readonly overdue: boolean;
}

export function projectDashboardState(
  parts: readonly PartBase[],
  events: readonly PartLifecycleEvent[],
  now: Timestamp,
  timezone: string,
  calendar: ProjectCalendar
): TaskItem[] {
  const items: TaskItem[] = [];
  for (const p of parts) {
    const state = projectPartState(
      events,
      p.partId,
      p.endDate,
      now,
      timezone,
      calendar
    );
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
