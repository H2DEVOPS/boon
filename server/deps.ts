/**
 * Server dependencies — event store, project repo.
 * Swap to DB later without touching domain.
 */

import { InMemoryProjectEventStore } from "../domain/eventStore.js";
import type { EventStore } from "../domain/eventStore.js";

const store = new InMemoryProjectEventStore();
export const eventStore: EventStore = store;

/** Reset event store for tests. */
export function resetEventStore(): void {
  store.clear();
}
