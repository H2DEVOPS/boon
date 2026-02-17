/**
 * Progress projections — completion classification and stage/project progress.
 * Pure domain; no Date.now usage.
 */

import type { ProjectCalendar } from "./calendar.js";
import type { PartLifecycleEvent } from "./events.js";
import type { PartBase } from "./projections.js";
import type { ProjectSnapshot } from "./projectSnapshot.js";
import { projectPartPace } from "./pace.js";

export type PartCompletionStatus = "NotCompleted" | "OnTime" | "Delayed" | "Early";

export interface StageProgress {
  readonly completed: number;
  readonly total: number;
  readonly percent: number;
}

export interface ProjectProgressStats {
  readonly percent: number;
  readonly onTime: number;
  readonly delayed: number;
  readonly early: number;
  readonly notCompleted: number;
}

export function projectPartCompletionStatus(
  events: readonly PartLifecycleEvent[],
  partId: string,
  endDate: string,
  calendar: ProjectCalendar,
  timezone: string
): PartCompletionStatus {
  const delta = projectPartPace(events, partId, endDate, calendar, timezone);
  if (delta == null) return "NotCompleted";
  if (delta < -1) return "Early";
  if (delta <= 1) return "OnTime";
  return "Delayed";
}

function collectStageSubtreePartIds(snapshot: ProjectSnapshot, stageId: string): string[] {
  const ROOT = "__root";
  const childrenOf = new Map<string, string[]>();
  for (const s of snapshot.stages) {
    const parentKey = s.parentStageId ?? ROOT;
    if (!childrenOf.has(parentKey)) childrenOf.set(parentKey, []);
    childrenOf.get(parentKey)!.push(s.id);
  }

  function subtreeIds(id: string): Set<string> {
    const result = new Set<string>([id]);
    for (const childId of childrenOf.get(id) ?? []) {
      for (const sub of subtreeIds(childId)) result.add(sub);
    }
    return result;
  }

  const ids = subtreeIds(stageId);
  return snapshot.parts.filter((p) => ids.has(p.stageId)).map((p) => p.partId);
}

export function computeStageProgress(
  stageId: string,
  snapshot: ProjectSnapshot,
  events: readonly PartLifecycleEvent[],
  calendar: ProjectCalendar,
  timezone: string
): StageProgress {
  const partIds = collectStageSubtreePartIds(snapshot, stageId);
  const total = partIds.length;
  if (total === 0) {
    return { completed: 0, total: 0, percent: 0 };
  }
  let completed = 0;
  for (const partId of partIds) {
    const part = snapshot.parts.find((p) => p.partId === partId)!;
    const status = projectPartCompletionStatus(events, partId, part.endDate, calendar, timezone);
    if (status !== "NotCompleted") completed++;
  }
  const percent = completed / total;
  return { completed, total, percent };
}

export function projectProgress(
  snapshot: ProjectSnapshot,
  events: readonly PartLifecycleEvent[],
  calendar: ProjectCalendar,
  timezone: string
): ProjectProgressStats {
  const parts: readonly PartBase[] = snapshot.parts;
  if (parts.length === 0) {
    return { percent: 0, onTime: 0, delayed: 0, early: 0, notCompleted: 0 };
  }

  let onTime = 0;
  let delayed = 0;
  let early = 0;
  let notCompleted = 0;

  for (const part of parts) {
    const status = projectPartCompletionStatus(events, part.partId, part.endDate, calendar, timezone);
    if (status === "OnTime") onTime++;
    else if (status === "Delayed") delayed++;
    else if (status === "Early") early++;
    else notCompleted++;
  }

  const completed = onTime + delayed + early;
  const percent = completed / parts.length;

  return { percent, onTime, delayed, early, notCompleted };
}

