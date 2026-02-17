import { describe, expect, it } from "vitest";
import {
  approvePart,
  completePart,
  snoozePart,
  reopenPart,
  getPartLifecycleState,
} from "./partLifecycle.js";
import { InvariantViolation } from "./errors.js";
import { asTimestamp } from "./core.js";

const TS = asTimestamp(Date.now());

describe("partLifecycle", () => {
  it("illegal approvePart from Completed rejected", () => {
    const events = [{ type: "PartCompleted" as const, partId: "p1", timestamp: TS }];
    expect(() => approvePart(events, "p1", TS)).toThrow(InvariantViolation);
    expect(() => approvePart(events, "p1", TS)).toThrow(/Invalid transition/);
  });

  it("illegal approvePart from Completed rejected", () => {
    const events = [{ type: "PartCompleted" as const, partId: "p1", timestamp: TS }];
    expect(() => approvePart(events, "p1", TS)).toThrow(InvariantViolation);
  });

  it("approvePart from Active succeeds", () => {
    const events = [{ type: "PartReopened" as const, partId: "p1", timestamp: TS }];
    const next = approvePart(events, "p1", TS);
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ type: "PartApproved", partId: "p1" });
  });

  it("reopenPart from Approved succeeds", () => {
    const events = [
      { type: "PartReopened" as const, partId: "p1", timestamp: TS },
      { type: "PartApproved" as const, partId: "p1", timestamp: TS },
    ];
    const next = reopenPart(events, "p1", TS);
    expect(getPartLifecycleState(next, "p1")).toBe("Active");
  });

  it("illegal reopenPart from Planned rejected", () => {
    const events: Parameters<typeof reopenPart>[0] = [];
    expect(() => reopenPart(events, "p1", TS)).toThrow(InvariantViolation);
  });

  it("completePart from Active succeeds", () => {
    const events = [{ type: "PartReopened" as const, partId: "p1", timestamp: TS }];
    const next = completePart(events, "p1", TS);
    expect(getPartLifecycleState(next, "p1")).toBe("Completed");
  });

  it("snoozePart from Active succeeds", () => {
    const events = [{ type: "PartReopened" as const, partId: "p1", timestamp: TS }];
    const next = snoozePart(events, "p1", "2025-02-25", TS);
    expect(getPartLifecycleState(next, "p1")).toBe("Active");
    expect(next[1]).toMatchObject({ type: "PartSnoozed", notificationDate: "2025-02-25" });
  });
});
