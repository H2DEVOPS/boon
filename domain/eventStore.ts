/**
 * Event store abstraction — append-only, project-scoped.
 * No business logic. Ordering preserved per project.
 */

import type { DomainEventUnion } from "./events.js";

/** Project-scoped event store interface. Append-only. Events immutable. */
export interface EventStore {
  append(projectId: string, events: readonly DomainEventUnion[]): Promise<void>;
  loadByPart(projectId: string, partId: string): Promise<DomainEventUnion[]>;
  loadByProject(projectId: string): Promise<DomainEventUnion[]>;
}

/** In-memory project-scoped adapter. For tests and deterministic replay. */
export class InMemoryProjectEventStore implements EventStore {
  private byProject = new Map<string, DomainEventUnion[]>();

  async append(projectId: string, events: readonly DomainEventUnion[]): Promise<void> {
    const list = this.byProject.get(projectId) ?? [];
    for (const e of events) list.push(e);
    this.byProject.set(projectId, list);
  }

  async loadByPart(projectId: string, partId: string): Promise<DomainEventUnion[]> {
    const list = this.byProject.get(projectId) ?? [];
    return list.filter((e) => e.partId === partId).slice();
  }

  async loadByProject(projectId: string): Promise<DomainEventUnion[]> {
    const list = this.byProject.get(projectId) ?? [];
    return list.slice();
  }

  /** Reset for tests. Not on EventStore interface. */
  clear(): void {
    this.byProject.clear();
  }
}
