import { describe, expect, it } from "vitest";
import { projectPartPace, projectPace } from "./pace.js";
import type { PartBase } from "./projections.js";
import type { PartLifecycleEvent } from "./events.js";
import { asTimestamp } from "./core.js";
import { defaultSwedishProjectCalendar } from "./calendar.js";

const CAL = defaultSwedishProjectCalendar();
const TZ = "Europe/Stockholm";

function ts(iso: string) {
  return asTimestamp(new Date(iso).getTime());
}

describe("projectPartPace", () => {
  it("completed on endDate → 0", () => {
    const events: PartLifecycleEvent[] = [
      { type: "PartCompleted", partId: "p1", timestamp: ts("2025-02-17T12:00:00Z") },
    ];
    const pace = projectPartPace(events, "p1", "2025-02-17", CAL, TZ);
    expect(pace).toBe(0);
  });

  it("completed next working day → 1", () => {
    const events: PartLifecycleEvent[] = [
      { type: "PartCompleted", partId: "p1", timestamp: ts("2025-02-18T09:00:00Z") },
    ];
    const pace = projectPartPace(events, "p1", "2025-02-17", CAL, TZ);
    expect(pace).toBe(1);
  });

  it("weekend crossing respected", () => {
    // Friday endDate, Monday completion → 1 working day late.
    const events: PartLifecycleEvent[] = [
      { type: "PartCompleted", partId: "p1", timestamp: ts("2025-02-17T09:00:00Z") }, // Monday
    ];
    const pace = projectPartPace(events, "p1", "2025-02-14", CAL, TZ); // Friday
    expect(pace).toBe(1);
  });

  it("early completion negative", () => {
    const events: PartLifecycleEvent[] = [
      { type: "PartCompleted", partId: "p1", timestamp: ts("2025-02-14T09:00:00Z") },
    ];
    const pace = projectPartPace(events, "p1", "2025-02-17", CAL, TZ);
    expect(pace).toBeLessThan(0);
  });

  it("no completed → null", () => {
    const events: PartLifecycleEvent[] = [
      { type: "PartApproved", partId: "p1", timestamp: ts("2025-02-17T09:00:00Z") },
    ];
    const pace = projectPartPace(events, "p1", "2025-02-17", CAL, TZ);
    expect(pace).toBeNull();
  });
});

describe("projectPace", () => {
  const parts: PartBase[] = [
    { partId: "A", endDate: "2025-02-17" },
    { partId: "B", endDate: "2025-02-17" },
    { partId: "C", endDate: "2025-02-17" },
  ];

  it("empty set → null stats", () => {
    const events: PartLifecycleEvent[] = [];
    const stats = projectPace(parts, events, CAL, TZ);
    expect(stats).toEqual({ average: null, worst: null, best: null });
  });

  it("aggregates average, worst, best", () => {
    const events: PartLifecycleEvent[] = [
      { type: "PartCompleted", partId: "A", timestamp: ts("2025-02-17T10:00:00Z") }, // 0
      { type: "PartCompleted", partId: "B", timestamp: ts("2025-02-18T10:00:00Z") }, // +1
      { type: "PartCompleted", partId: "C", timestamp: ts("2025-02-14T10:00:00Z") }, // negative
    ];
    const stats = projectPace(parts, events, CAL, TZ);
    expect(stats.average).not.toBeNull();
    expect(stats.worst).toBeGreaterThanOrEqual(0);
    expect(stats.best).toBeLessThanOrEqual(0);
  });
});

