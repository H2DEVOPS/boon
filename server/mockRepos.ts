/**
 * In-memory mock repositories. For dev and tests.
 * Swap for DB implementations without touching domain/handler.
 */

import type { ProjectRepo, ProjectSummary } from "../domain/repositories.js";
import type { ProjectSnapshot, ProjectSnapshotPart } from "../domain/projectSnapshot.js";
import type { Stage } from "../domain/gantt.js";
import { defaultSwedishProjectCalendar } from "../domain/calendar.js";

const MOCK_PROJECT: ProjectSummary = {
  projectId: "proj1",
  title: "Demo Project",
};

const MOCK_PARTS: ProjectSnapshotPart[] = [
  { partId: "p1", endDate: "2025-02-17", stageId: "s1", title: "Part 1", startDate: "2025-02-01" },
  { partId: "p2", endDate: "2025-02-18", stageId: "s1", title: "Part 2", startDate: "2025-02-01" },
  { partId: "p3", endDate: "2025-02-20", stageId: "s1", title: "Part 3", startDate: "2025-02-01" },
  { partId: "p4", endDate: "2025-02-17", stageId: "s1", title: "Part 4", startDate: "2025-02-01" },
];

const MOCK_STAGES: Stage[] = [{ id: "s1", title: "Stage 1" }];

const SNAPSHOT_PROJ1: ProjectSnapshot = {
  projectId: "proj1",
  title: MOCK_PROJECT.title,
  stages: MOCK_STAGES,
  parts: MOCK_PARTS,
  calendar: defaultSwedishProjectCalendar(),
};

/** Second project for isolation tests. */
const MOCK_PROJECT2: ProjectSummary = {
  projectId: "proj2",
  title: "Other Project",
};

const MOCK_PARTS2: ProjectSnapshotPart[] = [
  { partId: "q1", endDate: "2025-03-01", stageId: "s1", title: "Part Q1", startDate: "2025-02-15" },
];

const SNAPSHOT_PROJ2: ProjectSnapshot = {
  projectId: "proj2",
  title: MOCK_PROJECT2.title,
  stages: MOCK_STAGES,
  parts: MOCK_PARTS2,
  calendar: defaultSwedishProjectCalendar(),
};

const SNAPSHOTS = new Map<string, ProjectSnapshot>([
  ["proj1", SNAPSHOT_PROJ1],
  ["proj2", SNAPSHOT_PROJ2],
]);

export function createMockProjectRepo(): ProjectRepo {
  return {
    async listProjects(): Promise<readonly ProjectSummary[]> {
      const summaries: ProjectSummary[] = [];
      for (const snapshot of SNAPSHOTS.values()) {
        summaries.push({ projectId: snapshot.projectId, title: snapshot.title });
      }
      return summaries;
    },
    async getProject(projectId: string): Promise<ProjectSnapshot | null> {
      return SNAPSHOTS.get(projectId) ?? null;
    },
    async saveProject(snapshot: ProjectSnapshot): Promise<void> {
      SNAPSHOTS.set(snapshot.projectId, snapshot);
    },
  };
}
