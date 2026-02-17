/**
 * Persistence boundaries — interfaces only.
 * Domain stays pure; implementations are injected.
 */

import type { PartBase } from "./projections.js";
import type { Stage } from "./gantt.js";

/** Summary for project list. */
export interface ProjectSummary {
  readonly projectId: string;
  readonly title: string;
}

/** Part shape for gantt (IDs, titles, dates). */
export interface GanttPart {
  readonly id: string;
  readonly stageId?: string;
  readonly title: string;
  readonly startDate: string;
  readonly endDate: string;
  /** Optional resolved/override attrs. */
  readonly attrs?: Record<string, unknown>;
}

/** Full project data for gantt view. */
export interface ProjectGantt {
  readonly stages: readonly Stage[];
  readonly parts: readonly GanttPart[];
}

/** Project repository. */
export interface ProjectRepo {
  listProjects(): Promise<readonly ProjectSummary[]>;
  getProject(projectId: string): Promise<ProjectGantt | null>;
}

/** Part repository. */
export interface PartRepo {
  getPart(partId: string): Promise<PartBase | null>;
  listPartsByProject(projectId: string): Promise<readonly PartBase[]>;
}
