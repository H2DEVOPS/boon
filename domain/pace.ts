/**
 * Pace projections — working-day distance from planned endDate to completion.
 * Pure domain; no Date.now usage.
 */

import { diffWorkingDays } from "./workingDays.js";
import { dateKeyFromDate, type ProjectCalendar } from "./calendar.js";
import type { PartLifecycleEvent } from "./events.js";
import type { PartBase } from "./projections.js";

/** Stats for project-wide pace. */
export interface ProjectPaceStats {
  readonly average: number | null;
  readonly worst: number | null;
  readonly best: number | null;
}

/** Pace for a single part: working days from endDate to first completion, or null if not completed. */
export function projectPartPace(
  events: readonly PartLifecycleEvent[],
  partId: string,
  endDate: string,
  calendar: ProjectCalendar,
  timezone: string
): number | null {
  const completed = events
    .filter((e) => e.partId === partId && e.type === "PartCompleted")
    .sort((a, b) => a.timestamp - b.timestamp)[0];

  if (!completed) return null;

  const completedDateKey = dateKeyFromDate(new Date(completed.timestamp), timezone);
  return diffWorkingDays(endDate, completedDateKey, {
    workdays: calendar.weekendDays.includes(0) && calendar.weekendDays.includes(6)
      ? [1, 2, 3, 4, 5]
      : [1, 2, 3, 4, 5, 6, 7], // fallback for custom calendars; refined later if needed
  });
}

/** Aggregate pace across all completed parts in a project. */
export function projectPace(
  parts: readonly PartBase[],
  events: readonly PartLifecycleEvent[],
  calendar: ProjectCalendar,
  timezone: string
): ProjectPaceStats {
  const paces: number[] = [];
  for (const part of parts) {
    const pace = projectPartPace(events, part.partId, part.endDate, calendar, timezone);
    if (pace != null) paces.push(pace);
  }
  if (paces.length === 0) {
    return { average: null, worst: null, best: null };
  }
  const sum = paces.reduce((acc, v) => acc + v, 0);
  const average = sum / paces.length;
  const worst = Math.max(...paces);
  const best = Math.min(...paces);
  return { average, worst, best };
}

