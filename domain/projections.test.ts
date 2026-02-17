import { describe, expect, it } from "vitest";
import {
  projectPartState,
  projectDashboardState,
  type PartBase,
} from "./projections.js";
import { asTimestamp } from "./core.js";
import { defaultSwedishProjectCalendar } from "./calendar.js";

const CAL = defaultSwedishProjectCalendar();
const NOW = asTimestamp(new Date("2025-02-18T12:00:00Z").getTime());
const TS = asTimestamp(new Date("2025-02-01T12:00:00Z").getTime());

describe("projectPartState", () => {
  it("approved parts never in Tasks", () => {
    const events = [
      { type: "PartReopened" as const, partId: "p1", timestamp: TS, version: 0 },
      { type: "PartApproved" as const, partId: "p1", timestamp: TS, version: 0 },
    ];
    const state = projectPartState(events, "p1", "2025-02-17", NOW, "UTC", CAL);
    expect(state).toBe("Approved");
  });
});

describe("projectDashboardState", () => {
  it("approved parts never enter Tasks", () => {
    const parts: PartBase[] = [{ partId: "P1", endDate: "2025-02-20" }];
    const events = [
      { type: "PartReopened" as const, partId: "P1", timestamp: TS, version: 0 },
      { type: "PartApproved" as const, partId: "P1", timestamp: TS, version: 0 },
    ];
    const result = projectDashboardState(parts, events, NOW, "UTC", CAL);
    expect(result).toHaveLength(0);
  });

  it("event replay produces identical state", () => {
    const parts: PartBase[] = [
      { partId: "A", endDate: "2025-02-17" },
      { partId: "B", endDate: "2025-02-18" },
    ];
    const events = [
      {
        type: "PartSnoozed" as const,
        partId: "B",
        notificationDate: "2025-02-25",
        timestamp: TS,
        version: 0,
      },
    ];
    const r1 = projectDashboardState(parts, events, NOW, "UTC", CAL);
    const r2 = projectDashboardState(parts, [...events], NOW, "UTC", CAL);
    expect(r1).toEqual(r2);
  });

  it("snoozed deterministic expiry", () => {
    const parts: PartBase[] = [{ partId: "S", endDate: "2025-02-17" }];
    const events = [
      {
        type: "PartSnoozed" as const,
        partId: "S",
        notificationDate: "2025-02-20",
        timestamp: TS,
        version: 0,
      },
    ];
    const beforeExpiry = asTimestamp(new Date("2025-02-19T12:00:00Z").getTime());
    const afterExpiry = asTimestamp(new Date("2025-02-20T00:01:00Z").getTime());

    const before = projectDashboardState(parts, events, beforeExpiry, "UTC", CAL);
    expect(before[0]).toMatchObject({ partId: "S", status: "Snoozed" });

    const after = projectDashboardState(parts, events, afterExpiry, "UTC", CAL);
    expect(after[0]).toMatchObject({ partId: "S", status: "ActionRequired" });
  });
});
