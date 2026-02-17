/**
 * File-backed ProjectRepo. One JSON snapshot per project.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectRepo, ProjectSummary } from "../domain/repositories.js";
import type { ProjectSnapshot } from "../domain/projectSnapshot.js";
import { validateProjectSnapshot } from "../domain/projectSnapshot.js";

function safeId(projectId: string): string {
  return projectId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export class FileProjectRepo implements ProjectRepo {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  private snapshotPath(projectId: string): string {
    const id = safeId(projectId);
    return path.join(this.rootDir, `${id}.snapshot.json`);
  }

  private async loadSnapshotFromFile(file: string): Promise<ProjectSnapshot> {
    const text = await fs.readFile(file, "utf8");
    const raw = JSON.parse(text) as ProjectSnapshot;
    validateProjectSnapshot(raw);
    // Defensive copy: shallow clone + cloned arrays
    return {
      projectId: raw.projectId,
      title: raw.title,
      stages: [...raw.stages],
      parts: [...raw.parts],
      calendar: {
        timezone: raw.calendar.timezone,
        weekendDays: [...raw.calendar.weekendDays],
        overrides: [...raw.calendar.overrides],
      },
    };
  }

  async listProjects(): Promise<readonly ProjectSummary[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.rootDir);
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException;
      if (e && e.code === "ENOENT") {
        return [];
      }
      throw err;
    }

    const result: ProjectSummary[] = [];
    for (const name of entries) {
      if (!name.endsWith(".snapshot.json")) continue;
      const projectId = name.replace(/\.snapshot\.json$/, "");
      const file = path.join(this.rootDir, name);
      // Load snapshot to read title + validate
      const snapshot = await this.loadSnapshotFromFile(file);
      result.push({ projectId, title: snapshot.title });
    }
    return result;
  }

  async getProject(projectId: string): Promise<ProjectSnapshot | null> {
    const file = this.snapshotPath(projectId);
    try {
      const snapshot = await this.loadSnapshotFromFile(file);
      return snapshot;
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException;
      if (e && e.code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }
}

