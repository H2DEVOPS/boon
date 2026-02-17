import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, promises as fsPromises } from "node:fs";
import path from "node:path";
import os from "node:os";
import { FileProjectRepo } from "./fileProjectRepo.js";
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

describe("FileProjectRepo", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = mkdtempSync(path.join(os.tmpdir(), "projects-"));
  });

  it("listProjects returns seeded projects", async () => {
    const snap1 = { ...baseSnapshot, projectId: "proj1", title: "P1" };
    const snap2 = { ...baseSnapshot, projectId: "proj2", title: "P2" };
    await fsPromises.mkdir(rootDir, { recursive: true });
    await fsPromises.writeFile(
      path.join(rootDir, "proj1.snapshot.json"),
      JSON.stringify(snap1),
      "utf8"
    );
    await fsPromises.writeFile(
      path.join(rootDir, "proj2.snapshot.json"),
      JSON.stringify(snap2),
      "utf8"
    );

    const repo = new FileProjectRepo(rootDir);
    const projects = await repo.listProjects();
    expect(projects).toHaveLength(2);
    const ids = projects.map((p) => p.projectId).sort();
    expect(ids).toEqual(["proj1", "proj2"]);
  });

  it("getProject loads and validates snapshot", async () => {
    await fsPromises.mkdir(rootDir, { recursive: true });
    await fsPromises.writeFile(
      path.join(rootDir, "proj1.snapshot.json"),
      JSON.stringify(baseSnapshot),
      "utf8"
    );

    const repo = new FileProjectRepo(rootDir);
    const snapshot = await repo.getProject("proj1");
    expect(snapshot).not.toBeNull();
    expect(snapshot!.projectId).toBe("proj1");
    expect(snapshot!.stages).toHaveLength(1);
    expect(snapshot!.parts).toHaveLength(1);
  });

  it("missing project returns null", async () => {
    const repo = new FileProjectRepo(rootDir);
    const snapshot = await repo.getProject("missing");
    expect(snapshot).toBeNull();
  });

  it("invalid snapshot JSON throws", async () => {
    await fsPromises.mkdir(rootDir, { recursive: true });
    await fsPromises.writeFile(
      path.join(rootDir, "bad.snapshot.json"),
      "{not-json",
      "utf8"
    );
    const repo = new FileProjectRepo(rootDir);
    await expect(repo.getProject("bad")).rejects.toThrow();
  });

  it("invalid snapshot invariants throw", async () => {
    await fsPromises.mkdir(rootDir, { recursive: true });
    const invalid: ProjectSnapshot = {
      projectId: "proj1",
      title: "Invalid",
      stages: [{ id: "root", title: "Root" }],
      parts: [], // violates validateTree: stage without parts in subtree
      calendar: {
        timezone: "Europe/Stockholm",
        weekendDays: [0, 6],
        overrides: [],
      },
    };
    await fsPromises.writeFile(
      path.join(rootDir, "proj1.snapshot.json"),
      JSON.stringify(invalid),
      "utf8"
    );
    const repo = new FileProjectRepo(rootDir);
    await expect(repo.getProject("proj1")).rejects.toThrow();
  });

  afterEach(() => {
    if (existsSync(rootDir)) {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

