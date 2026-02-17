/**
 * Project snapshot — single object for project structure + calendar.
 * Invariants validated via validateTree.
 */

import type { ProjectCalendar } from "./calendar.js";
import type { PartBase } from "./projections.js";
import type { Stage } from "./gantt.js";
import { validateTree } from "./gantt.js";

/** Part definition with gantt fields. Extends PartBase for dashboard projection. */
export interface ProjectSnapshotPart extends PartBase {
  readonly stageId: string;
  readonly title: string;
  readonly startDate: string;
}

/** Project snapshot: structure + calendar. Single source for project data. */
export interface ProjectSnapshot {
  readonly projectId: string;
  readonly title: string;
  readonly stages: readonly Stage[];
  readonly parts: readonly ProjectSnapshotPart[];
  readonly calendar: ProjectCalendar;
}

/** Map snapshot part to gantt Part for validateTree. */
function toGanttPart(p: ProjectSnapshotPart): { id: string; stageId: string; title: string; startDate: string; endDate: string; approved: boolean } {
  return {
    id: p.partId,
    stageId: p.stageId,
    title: p.title,
    startDate: p.startDate,
    endDate: p.endDate,
    approved: false,
  };
}

/** Validate snapshot invariants. Throws InvariantViolation on failure. */
export function validateProjectSnapshot(snapshot: ProjectSnapshot): void {
  const ganttParts = snapshot.parts.map(toGanttPart);
  validateTree(snapshot.stages, ganttParts);
}
