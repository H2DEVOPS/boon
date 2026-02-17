/**
 * File-backed project event store. Append-only NDJSON per project.
 * Adapter only — domain/EventStore interface unchanged.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { EventStore } from "../domain/eventStore.js";
import type { DomainEventUnion } from "../domain/events.js";
import type { ProjectorSnapshot } from "../domain/projectorSnapshot.js";
import type { CommandId } from "../domain/command.js";
import { safeId } from "./safeId.js";

export class FileProjectEventStore implements EventStore {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.rootDir, { recursive: true });
  }

  private eventsPath(projectId: string): string {
    const id = safeId(projectId);
    return path.join(this.rootDir, `${id}.events.ndjson`);
  }

  private snapshotPath(projectId: string): string {
    const id = safeId(projectId);
    return path.join(this.rootDir, `${id}.events.snapshot.json`);
  }

  async append(projectId: string, events: readonly DomainEventUnion[]): Promise<void> {
    if (events.length === 0) return;
    await this.ensureDir();
    const file = this.eventsPath(projectId);
    const lines = events.map((e) => JSON.stringify(e) + "\n").join("");
    const fh = await fs.open(file, "a");
    try {
      await fh.write(lines);
      await fh.sync();
    } finally {
      await fh.close();
    }
  }

  private async loadSnapshot(projectId: string): Promise<ProjectorSnapshot | null> {
    const file = this.snapshotPath(projectId);
    try {
      const text = await fs.readFile(file, "utf8");
      const snapshot = JSON.parse(text) as ProjectorSnapshot;
      return snapshot;
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException;
      if (e?.code === "ENOENT") return null;
      throw err;
    }
  }

  async loadByProject(projectId: string): Promise<DomainEventUnion[]> {
    const file = this.eventsPath(projectId);
    const snapshot = await this.loadSnapshot(projectId);
    const cutoff = snapshot?.lastEventTimestamp ?? null;

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
      if (cutoff != null && obj.timestamp <= cutoff) continue;
      events.push(parsed as DomainEventUnion);
    }
    return events.slice();
  }

  async loadByPart(projectId: string, partId: string): Promise<DomainEventUnion[]> {
    const all = await this.loadByProject(projectId);
    return all.filter((e) => e.partId === partId);
  }

  async hasCommand(projectId: string, commandId: CommandId): Promise<boolean> {
    const file = this.eventsPath(projectId);
    let text: string;
    try {
      text = await fs.readFile(file, "utf8");
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException;
      if (e && e.code === "ENOENT") {
        return false;
      }
      throw err;
    }

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
      const obj = parsed as { commandId?: unknown };
      if (obj.commandId === commandId) return true;
    }
    return false;
  }

  async compact(projectId: string, snapshot: ProjectorSnapshot): Promise<void> {
    if (snapshot.projectId !== projectId) {
      throw new Error("projectId mismatch between argument and snapshot");
    }
    await this.ensureDir();
    const snapFile = this.snapshotPath(projectId);
    const dir = path.dirname(snapFile);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${snapFile}.tmp`;
    const json = JSON.stringify(snapshot, null, 2);
    await fs.writeFile(tmp, json, "utf8");
    await fs.rename(tmp, snapFile);

    // Truncate event log after snapshot is safely written.
    const eventsFile = this.eventsPath(projectId);
    try {
      await fs.writeFile(eventsFile, "", "utf8");
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException;
      if (e?.code === "ENOENT") return;
      throw err;
    }
  }
}

