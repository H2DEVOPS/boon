/**
 * Part lifecycle state machine. Explicit transitions. No UI logic.
 */

import type { Timestamp } from "./core.js";
import { InvariantViolation } from "./errors.js";
import type { PartLifecycleEvent } from "./events.js";

export type PartLifecycleState = "Planned" | "Active" | "Completed" | "Approved" | "Blocked";

const VALID_APPROVE: PartLifecycleState[] = ["Planned", "Active"];
const VALID_COMPLETE: PartLifecycleState[] = ["Planned", "Active"];
const VALID_SNOOZE: PartLifecycleState[] = ["Planned", "Active"];
const VALID_REOPEN: PartLifecycleState[] = ["Completed", "Approved"];

function projectLifecycleState(
  events: readonly PartLifecycleEvent[],
  partId: string
): PartLifecycleState {
  const partEvents = events
    .filter((e) => e.partId === partId)
    .sort((a, b) => a.timestamp - b.timestamp);

  let state: PartLifecycleState = "Planned";
  for (const e of partEvents) {
    switch (e.type) {
      case "PartApproved":
        state = "Approved";
        break;
      case "PartCompleted":
        state = "Completed";
        break;
      case "PartReopened":
        state = "Active";
        break;
      case "PartSnoozed":
        state = "Active";
        break;
      default:
        break;
    }
  }
  if (state === "Planned" && partEvents.length > 0) state = "Active";
  return state;
}

function assertValidTransition(
  current: PartLifecycleState,
  valid: readonly PartLifecycleState[],
  action: string
): void {
  if (!valid.includes(current)) {
    throw new InvariantViolation(`Invalid transition: ${action} from ${current}`, {
      current,
      valid: [...valid],
    });
  }
}

/** Append PartApproved. Valid from Active. Returns new event stream. */
export function approvePart(
  events: readonly PartLifecycleEvent[],
  partId: string,
  timestamp: Timestamp
): PartLifecycleEvent[] {
  const current = projectLifecycleState(events, partId);
  assertValidTransition(current, VALID_APPROVE, "approvePart");
  return [...events, { type: "PartApproved", partId, timestamp, version: 0 }];
}

/** Append PartCompleted. Valid from Active. Returns new event stream. */
export function completePart(
  events: readonly PartLifecycleEvent[],
  partId: string,
  timestamp: Timestamp
): PartLifecycleEvent[] {
  const current = projectLifecycleState(events, partId);
  assertValidTransition(current, VALID_COMPLETE, "completePart");
  return [...events, { type: "PartCompleted", partId, timestamp, version: 0 }];
}

/** Append PartSnoozed. Valid from Active. Returns new event stream. */
export function snoozePart(
  events: readonly PartLifecycleEvent[],
  partId: string,
  notificationDate: string,
  timestamp: Timestamp
): PartLifecycleEvent[] {
  const current = projectLifecycleState(events, partId);
  assertValidTransition(current, VALID_SNOOZE, "snoozePart");
  return [...events, { type: "PartSnoozed", partId, notificationDate, timestamp, version: 0 }];
}

/** Append PartReopened. Valid from Completed or Approved. Returns new event stream. */
export function reopenPart(
  events: readonly PartLifecycleEvent[],
  partId: string,
  timestamp: Timestamp
): PartLifecycleEvent[] {
  const current = projectLifecycleState(events, partId);
  assertValidTransition(current, VALID_REOPEN, "reopenPart");
  return [...events, { type: "PartReopened", partId, timestamp, version: 0 }];
}

/** Project current lifecycle state for a part. */
export function getPartLifecycleState(
  events: readonly PartLifecycleEvent[],
  partId: string
): PartLifecycleState {
  return projectLifecycleState(events, partId);
}
