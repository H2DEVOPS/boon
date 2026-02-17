/**
 * In-memory mock repositories. For dev and tests.
 * Swap for DB implementations without touching domain/handler.
 */

import type { ProjectRepo, ProjectSummary, ProjectGantt, PartRepo } from "../domain/repositories.js";
import type { PartBase } from "../domain/projections.js";
import type { Stage } from "../domain/gantt.js";

const MOCK_PROJECT: ProjectSummary = {
  projectId: "proj1",
  title: "Demo Project",
};

const MOCK_PARTS: PartBase[] = [
  { partId: "p1", endDate: "2025-02-17" },
  { partId: "p2", endDate: "2025-02-18" },
  { partId: "p3", endDate: "2025-02-20" },
  { partId: "p4", endDate: "2025-02-17" },
];

const MOCK_STAGES: Stage[] = [
  { id: "s1", title: "Stage 1" },
];

const MOCK_GANTT_PARTS = MOCK_PARTS.map((p, i) => ({
  id: p.partId,
  stageId: "s1",
  title: `Part ${i + 1}`,
  startDate: "2025-02-01",
  endDate: p.endDate,
}));

export function createMockProjectRepo(): ProjectRepo {
  return {
    async listProjects(): Promise<readonly ProjectSummary[]> {
      return [MOCK_PROJECT];
    },
    async getProject(projectId: string): Promise<ProjectGantt | null> {
      if (projectId !== "proj1") return null;
      return {
        stages: MOCK_STAGES,
        parts: MOCK_GANTT_PARTS,
      };
    },
  };
}

export function createMockPartRepo(): PartRepo {
  const partsByProject = new Map<string, PartBase[]>();
  partsByProject.set("proj1", [...MOCK_PARTS]);

  const partById = new Map(MOCK_PARTS.map((p) => [p.partId, p]));

  return {
    async getPart(partId: string): Promise<PartBase | null> {
      return partById.get(partId) ?? null;
    },
    async listPartsByProject(projectId: string): Promise<readonly PartBase[]> {
      return partsByProject.get(projectId) ?? [];
    },
  };
}
