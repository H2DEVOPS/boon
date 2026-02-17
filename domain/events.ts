/**
 * Domain events — immutable, append-only. No side effects.
 */

import type { Timestamp } from "./core.js";
import type { CommandId } from "./command.js";

/** Date-only string (YYYY-MM-DD). */
export type DateKey = string;

/** Base domain event. All events immutable. */
export interface DomainEvent {
  readonly type: string;
  readonly partId: string;
  readonly timestamp: Timestamp;
  /** Optional idempotent command identifier that produced this event. */
  readonly commandId?: CommandId;
  /**
   * Monotonic per-project event stream version.
   * Assigned by the EventStore on append.
   */
  readonly version: number;
}

export interface PartApproved extends DomainEvent {
  readonly type: "PartApproved";
}

export interface PartSnoozed extends DomainEvent {
  readonly type: "PartSnoozed";
  readonly notificationDate: DateKey;
}

export interface PartCompleted extends DomainEvent {
  readonly type: "PartCompleted";
}

export interface PartReopened extends DomainEvent {
  readonly type: "PartReopened";
}

export interface DeviationRaised extends DomainEvent {
  readonly type: "DeviationRaised";
  readonly deviationId?: string;
}

export interface DeviationResolved extends DomainEvent {
  readonly type: "DeviationResolved";
  readonly deviationId?: string;
}

export type PartLifecycleEvent =
  | PartApproved
  | PartSnoozed
  | PartCompleted
  | PartReopened;

export type DomainEventUnion =
  | PartApproved
  | PartSnoozed
  | PartCompleted
  | PartReopened
  | DeviationRaised
  | DeviationResolved;
