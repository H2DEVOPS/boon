/**
 * File-backed project event store. Append-only NDJSON per project.
 * Adapter only — domain/EventStore interface unchanged.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { EventStore } from "../domain/eventStore.js";
import type { DomainEventUnion } from "../domain/events.js";

export class FileProjectEventStore implements EventStore {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.rootDir, { recursive: true });
  }

  private filePath(projectId: string): string {
    const safeId = projectId.replace(/[^a-zA-Z0-9._-]/g, "_");
    return path.join(this.rootDir, `${safeId}.events.ndjson`);
  }

  async append(projectId: string, events: readonly DomainEventUnion[]): Promise<void> {
    if (events.length === 0) return;
    await this.ensureDir();
    const file = this.filePath(projectId);
    const lines = events.map((e) => JSON.stringify(e) + "\n").join("");
    const fh = await fs.open(file, "a");
    try {
      await fh.write(lines);
      // Ensure data is flushed to disk for durability.
      await fh.sync();
    } finally {
      await fh.close();
    }
  }

  async loadByProject(projectId: string): Promise<DomainEventUnion[]> {
    const file = this.filePath(projectId);
    let text: string;
    try {
      text = await fs.readFile(file, "utf8");
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException;
      if (e && e.code === "ENOENT") {
        return [];
      }
      throw err;
    }

    const events: DomainEventUnion[] = [];
    const lines = text.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        throw new Error("Invalid JSON in event log");
      }
      const obj = parsed as { type?: unknown; partId?: unknown; timestamp?: unknown };
      if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof obj.type !== "string" ||
        typeof obj.partId !== "string" ||
        typeof obj.timestamp !== "number"
      ) {
        throw new Error("Invalid event shape in event log");
      }
      events.push(parsed as DomainEventUnion);
    }
    return events.slice();
  }

  async loadByPart(projectId: string, partId: string): Promise<DomainEventUnion[]> {
    const all = await this.loadByProject(projectId);
    return all.filter((e) => e.partId === partId);
  }
}

