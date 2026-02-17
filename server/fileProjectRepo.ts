/**
 * File-backed ProjectRepo. One JSON snapshot per project.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectRepo, ProjectSummary } from "../domain/repositories.js";
import type { ProjectSnapshot } from "../domain/projectSnapshot.js";
import { validateProjectSnapshot } from "../domain/projectSnapshot.js";
import { safeId } from "./safeId.js";

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

    let raw: ProjectSnapshot;
    try {
      raw = JSON.parse(text) as ProjectSnapshot;
    } catch {
      throw new Error("Invalid JSON in project snapshot");
    }

    validateProjectSnapshot(raw);

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
      if (e?.code === "ENOENT") return [];
      throw err;
    }

    const result: ProjectSummary[] = [];

    for (const name of entries) {
      if (!name.endsWith(".snapshot.json")) continue;

      const file = path.join(this.rootDir, name);
      const snapshot = await this.loadSnapshotFromFile(file);

      result.push({
        projectId: snapshot.projectId,
        title: snapshot.title,
      });
    }

    return result;
  }

  async getProject(projectId: string): Promise<ProjectSnapshot | null> {
    const file = this.snapshotPath(projectId);

    try {
      return await this.loadSnapshotFromFile(file);
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException;
      if (e?.code === "ENOENT") return null;
      throw err;
    }
  }

  async saveProject(snapshot: ProjectSnapshot): Promise<void> {
    // Validate before writing
    validateProjectSnapshot(snapshot);

    const file = this.snapshotPath(snapshot.projectId);
    const dir = path.dirname(file);
    await fs.mkdir(dir, { recursive: true });

    const tmp = `${file}.tmp`;
    const json = JSON.stringify(snapshot, null, 2);

    await fs.writeFile(tmp, json, "utf8");
    await fs.rename(tmp, file);
  }

  async deleteProject(projectId: string): Promise<void> {
    const file = this.snapshotPath(projectId);
    try {
      await fs.unlink(file);
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException;
      if (e?.code === "ENOENT") return;
      throw err;
    }
  }
}