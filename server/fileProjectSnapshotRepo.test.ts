import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { FileProjectSnapshotRepo } from "./fileProjectSnapshotRepo.js";
import type { ProjectSnapshot } from "../domain/projectSnapshot.js";

const baseSnapshot: ProjectSnapshot = {
  projectId: "proj1",
  title: "Demo Project",
  stages: [{ id: "s1", title: "Stage 1" }],
  parts: [
    {
      partId: "p1",
      endDate: "2025-02-17",
      stageId: "s1",
      title: "Part 1",
      startDate: "2025-02-01",
    },
  ],
  calendar: {
    timezone: "Europe/Stockholm",
    weekendDays: [0, 6],
    overrides: [],
  },
};

describe("FileProjectSnapshotRepo", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(path.join(os.tmpdir(), "snapshots-"));
  });

  it("save + load roundtrip", async () => {
    const repo = new FileProjectSnapshotRepo(rootDir);
    const snap: ProjectSnapshot = { ...baseSnapshot, projectId: "proj1", title: "Roundtrip" };
    await repo.saveProject(snap);

    const loaded = await repo.getProject("proj1");
    expect(loaded).not.toBeNull();
    expect(loaded!.projectId).toBe("proj1");
    expect(loaded!.title).toBe("Roundtrip");
  });

  it("multiple projects appear in listProjects", async () => {
    const repo = new FileProjectSnapshotRepo(rootDir);
    await repo.saveProject({ ...baseSnapshot, projectId: "proj1", title: "P1" });
    await repo.saveProject({ ...baseSnapshot, projectId: "proj2", title: "P2" });

    const projects = await repo.listProjects();
    const ids = projects.map((p) => p.projectId).sort();
    expect(ids).toEqual(["proj1", "proj2"]);
  });

  it("ENOENT handling: empty dir yields [] / null", async () => {
    const repo = new FileProjectSnapshotRepo(rootDir);
    const projects = await repo.listProjects();
    expect(projects).toEqual([]);

    const missing = await repo.getProject("missing");
    expect(missing).toBeNull();
  });

  it("defensive copy on read", async () => {
    const repo = new FileProjectSnapshotRepo(rootDir);
    await repo.saveProject(baseSnapshot);

    const loaded1 = await repo.getProject("proj1");
    expect(loaded1).not.toBeNull();
    // Mutate returned snapshot
    loaded1!.parts.push({
      partId: "p2",
      endDate: "2025-02-18",
      stageId: "s1",
      title: "Mutable",
      startDate: "2025-02-02",
    });

    const loaded2 = await repo.getProject("proj1");
    expect(loaded2).not.toBeNull();
    // Original persisted snapshot should still have only the base part.
    expect(loaded2!.parts).toHaveLength(1);
  });

  afterEach(() => {
    if (existsSync(rootDir)) {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

