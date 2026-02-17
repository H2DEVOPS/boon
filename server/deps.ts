/**
 * Server dependencies — event store, calendar.
 * Swap to DB later without touching domain.
 */

import { InMemoryEventStore } from "../domain/eventStore.js";
import { defaultSwedishProjectCalendar } from "../domain/calendar.js";
import type { EventStore } from "../domain/eventStore.js";
import type { ProjectCalendar } from "../domain/calendar.js";

const store = new InMemoryEventStore();
export const eventStore: EventStore = store;
export const calendar: ProjectCalendar = defaultSwedishProjectCalendar();

/** Reset event store for tests. */
export function resetEventStore(): void {
  store.clear();
}
