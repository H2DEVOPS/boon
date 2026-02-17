/**
 * Persistence boundaries — interfaces only.
 * Domain stays pure; implementations are injected.
 */

import type { ProjectSnapshot } from "./projectSnapshot.js";

/** Summary for project list. */
export interface ProjectSummary {
  readonly projectId: string;
  readonly title: string;
}

/** Project repository. Returns full snapshot. */
export interface ProjectRepo {
  listProjects(): Promise<readonly ProjectSummary[]>;
  getProject(projectId: string): Promise<ProjectSnapshot | null>;
  saveProject(snapshot: ProjectSnapshot): Promise<void>;
}
