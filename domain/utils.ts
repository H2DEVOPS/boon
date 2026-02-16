/**
 * Domain utilities — pure helpers, no business logic.
 * Framework-independent.
 */

import type { Duration, EntityId, Timestamp } from "./core.js";
import { asTimestamp } from "./core.js";

/** Create an EntityId from a string value. */
export function createEntityId(value: string): EntityId {
  return value as EntityId;
}

/** Current time as UTC epoch milliseconds. */
export function now(): Timestamp {
  return asTimestamp(Date.now());
}

/** Add a duration to a timestamp. */
export function addDuration(ts: Timestamp, d: Duration): Timestamp {
  return asTimestamp(ts + d);
}

/** Compare two timestamps. Returns < 0 if a < b, 0 if equal, > 0 if a > b. */
export function compareTimestamps(a: Timestamp, b: Timestamp): number {
  return a - b;
}
