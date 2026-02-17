/**
 * Event store abstraction — append-only, immutable events.
 * No business logic. Ordering preserved.
 */

import type { DomainEventUnion } from "./events.js";

/** Event store interface. Append-only. Events immutable. */
export interface EventStore {
  append(events: readonly DomainEventUnion[]): Promise<void>;
  loadByPart(partId: string): Promise<DomainEventUnion[]>;
  loadAll(): Promise<DomainEventUnion[]>;
}

/** In-memory adapter. For tests and deterministic replay. */
export class InMemoryEventStore implements EventStore {
  private events: DomainEventUnion[] = [];

  async append(events: readonly DomainEventUnion[]): Promise<void> {
    for (const e of events) this.events.push(e);
  }

  async loadByPart(partId: string): Promise<DomainEventUnion[]> {
    return this.events.filter((e) => e.partId === partId).slice();
  }

  async loadAll(): Promise<DomainEventUnion[]> {
    return this.events.slice();
  }

  /** Reset for tests. Not on EventStore interface. */
  clear(): void {
    this.events = [];
  }
}
