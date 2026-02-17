/**
 * Event store abstraction — append-only, project-scoped.
 * No business logic. Ordering preserved per project.
 */

import type { DomainEventUnion } from "./events.js";
import type { ProjectorSnapshot } from "./projectorSnapshot.js";
import type { CommandId } from "./command.js";
import { ConcurrencyError } from "./errors.js";

/** Project-scoped event store interface. Append-only. Events immutable. */
export interface EventStore {
  append(projectId: string, expectedVersion: number, events: readonly DomainEventUnion[]): Promise<void>;
  loadByPart(projectId: string, partId: string): Promise<DomainEventUnion[]>;
  loadByProject(projectId: string): Promise<DomainEventUnion[]>;
  compact(projectId: string, snapshot: ProjectorSnapshot): Promise<void>;
  hasCommand(projectId: string, commandId: CommandId): Promise<boolean>;
}

/** In-memory project-scoped adapter. For tests and deterministic replay. */
export class InMemoryProjectEventStore implements EventStore {
  private byProject = new Map<string, DomainEventUnion[]>();

  async append(projectId: string, expectedVersion: number, events: readonly DomainEventUnion[]): Promise<void> {
    const list = this.byProject.get(projectId) ?? [];
    const currentVersion = list.length;
    if (currentVersion !== expectedVersion) {
      throw new ConcurrencyError("Concurrent modification detected", {
        projectId,
        expectedVersion,
        currentVersion,
      });
    }
    if (events.length === 0) return;
    const base = currentVersion;
    const withVersion = events.map((e, index) => ({
      ...e,
      version: base + index + 1,
    }));
    this.byProject.set(projectId, list.concat(withVersion));
  }

  async loadByPart(projectId: string, partId: string): Promise<DomainEventUnion[]> {
    const list = this.byProject.get(projectId) ?? [];
    return list.filter((e) => e.partId === partId).slice();
  }

  async loadByProject(projectId: string): Promise<DomainEventUnion[]> {
    const list = this.byProject.get(projectId) ?? [];
    return list.slice();
  }

  async hasCommand(projectId: string, commandId: CommandId): Promise<boolean> {
    const list = this.byProject.get(projectId) ?? [];
    return list.some((e) => e.commandId === commandId);
  }

  async compact(projectId: string, snapshot: ProjectorSnapshot): Promise<void> {
    // No-op for in-memory store; provided for interface completeness.
    void projectId;
    void snapshot;
  }

  /** Reset for tests. Not on EventStore interface. */
  clear(): void {
    this.byProject.clear();
  }
}
